# Phase 2: AaaS-Driven Inbound Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ALVer database a true read cache of eVault data. Changes to ALVer-related envelopes in any user's eVault — made by another platform or directly — propagate to the local DB via AaaS polling and webhook delivery within 60 seconds.

**Architecture:** Extend the existing AaaSService (already correct for User) to poll all 5 ontologies with per-ontology cursors. Add a new InboundSyncService with one handler per ontology. Update WebhookController to dispatch to InboundSyncService for all 5 ontologies. Anti-echo is already handled: adapter.lockedIds guards outbound re-sync.

**Tech Stack:** TypeScript/Express, TypeORM, AaaS REST API, eVault GraphQL.

## Global Constraints

- AaaS base URL: `https://aaas.w3ds.metastate.foundation`
- AaaS auth: `Authorization: Bearer <AAAS_API_KEY>` (NOT DEVELOPER_API_KEY)
- AaaS query params: `ontology`, `from`, `limit`, `cursor`
- AaaS response shape: `{ packets: [...], hasMore: boolean, nextCursor: string | null }`
- Anti-echo: check `adapter.lockedIds.includes(globalId)` before any inbound apply
- Inbound sync UPDATES only — never creates new meetings/polls/votes from external sources
- Community updates use `vaultEname` (community ename) as lookup key, not globalId
- Phase 1 must be complete (ontology.ts file already created)
- Per memory: never push to GitHub; commit locally only

---

## File Map

| File | Action | What changes |
|---|---|---|
| `api/src/lib/w3ds/ontology.ts` | **Verify** | Already has all 5 ontologies from Phase 1 |
| `api/src/services/InboundSyncService.ts` | **Create** | 4 handlers: Community, Meeting, Poll, Vote |
| `api/src/services/AaaSService.ts` | **Modify** | Expand from 1 to 5 ontologies, per-ontology cursors |
| `api/src/controllers/WebhookController.ts` | **Modify** | Dispatch on Community/Meeting/Poll/Vote ontologies |
| `api/.env.example` | **Modify** | Document AAAS_API_KEY (already used but undocumented) |

---

### Task 1: InboundSyncService

**Files:**
- Create: `api/src/services/InboundSyncService.ts`

**Interfaces:**
- Consumes: TypeORM repos for Community, Meeting, Poll, Vote; `adapter` from subscriber
- Produces:
  - `syncCommunityFromEvault(vaultEname: string, data: Record<string, unknown>): Promise<void>`
  - `syncMeetingFromEvault(globalId: string, data: Record<string, unknown>): Promise<void>`
  - `syncPollFromEvault(globalId: string, data: Record<string, unknown>): Promise<void>`
  - `syncVoteFromEvault(globalId: string, data: Record<string, unknown>): Promise<void>`

- [ ] **Step 1: Read the adapter's mappingDb API**

```bash
grep -n "getLocalId\|getGlobalId\|storeMapping" /home/serzhilin/Projects/ALVer/api/src/web3adapter/subscriber.ts | head -20
grep -rn "getLocalId\|mappingDb" /home/serzhilin/Projects/ALVer/vendor/ 2>/dev/null | head -20
```

Verify the method name for looking up localId from globalId. Typically `adapter.mappingDb.getLocalId(globalId)`.

- [ ] **Step 2: Create `api/src/services/InboundSyncService.ts`**

```typescript
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
import { Meeting } from "../database/entities/Meeting";
import { Poll } from "../database/entities/Poll";
import { Vote } from "../database/entities/Vote";
import { adapter } from "../web3adapter/subscriber";
import { logger } from "../lib/logger";

/**
 * Inbound sync handlers — called from WebhookController and AaaSService
 * when external eVault changes arrive. Only updates existing rows; never creates.
 * Field mapping: universal envelope field → local column.
 */

/** Community: look up by community ename (vaultEname), patch name/logo/description. */
export async function syncCommunityFromEvault(
    vaultEname: string,
    data: Record<string, unknown>
): Promise<void> {
    const repo = AppDataSource.getRepository(Community);
    const normalized = vaultEname.startsWith('@') ? vaultEname : `@${vaultEname}`;
    const community = await repo.findOne({ where: { ename: normalized } })
        ?? await repo.findOne({ where: { ename: vaultEname } });
    if (!community) {
        logger.debug({ vaultEname }, '[InboundSync] Community not found locally, skipping');
        return;
    }

    const patch: Partial<Community> = {};
    if (data.name != null)        patch.name     = data.name as string;
    if (data.avatar != null)      patch.logo_url = data.avatar as string;
    if (data.description != null) {
        // description has no column on Community yet — log only
        logger.debug({ vaultEname }, '[InboundSync] Community description received (no local column)');
    }

    if (Object.keys(patch).length > 0) {
        await repo.update(community.id, patch);
        logger.info({ vaultEname, patch }, '[InboundSync] Community updated');
    }
}

/** Meeting: look up by globalId via mapping table, patch name/start/end. */
export async function syncMeetingFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, '[InboundSync] Meeting not found in mapping table, skipping');
        return;
    }

    const repo = AppDataSource.getRepository(Meeting);
    const meeting = await repo.findOne({ where: { id: localId } });
    if (!meeting) {
        logger.debug({ globalId, localId }, '[InboundSync] Meeting row not found, skipping');
        return;
    }

    const patch: Partial<Meeting> = {};
    if (data.title != null) patch.name          = data.title as string;
    if (data.start != null) patch.startDateTime = new Date(data.start as string);
    if (data.end   != null) patch.endDateTime   = new Date(data.end as string);

    if (Object.keys(patch).length > 0) {
        await repo.update(localId, patch);
        logger.info({ globalId, localId, patch }, '[InboundSync] Meeting updated');
    }
}

/** Poll: look up by globalId via mapping table, patch title/options/mode/deadline. */
export async function syncPollFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, '[InboundSync] Poll not found in mapping table, skipping');
        return;
    }

    const repo = AppDataSource.getRepository(Poll);
    const poll = await repo.findOne({ where: { id: localId } });
    if (!poll) {
        logger.debug({ globalId, localId }, '[InboundSync] Poll row not found, skipping');
        return;
    }

    const patch: Partial<Poll> = {};
    if (data.title    != null) patch.motion_text = data.title as string;
    if (data.deadline != null) patch.closed_at   = new Date(data.deadline as string);
    // option_labels updated if present (vote_options kept intact — Phase 3 adds this column)
    // mode/votingWeight — Poll entity may not have these columns yet; skip silently

    if (Object.keys(patch).length > 0) {
        await repo.update(localId, patch);
        logger.info({ globalId, localId, patch }, '[InboundSync] Poll updated');
    }
}

/** Vote: look up by globalId via mapping table; update voter_ename from voterId if present. */
export async function syncVoteFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, '[InboundSync] Vote not found in mapping table, skipping');
        return;
    }

    const repo = AppDataSource.getRepository(Vote);
    const vote = await repo.findOne({ where: { id: localId } });
    if (!vote) {
        logger.debug({ globalId, localId }, '[InboundSync] Vote row not found, skipping');
        return;
    }

    const patch: Partial<Vote> = {};
    if (data.voterId != null) patch.voter_ename = data.voterId as string;
    // vote_data and voter_meta_envelope_id added in Phase 3

    if (Object.keys(patch).length > 0) {
        await repo.update(localId, patch);
        logger.info({ globalId, localId, patch }, '[InboundSync] Vote updated');
    }
}
```

- [ ] **Step 3: Check Meeting entity has the expected columns**

```bash
grep -n "startDateTime\|endDateTime\|name" /home/serzhilin/Projects/ALVer/api/src/database/entities/Meeting.ts | head -15
```

If column names differ, fix the field names in syncMeetingFromEvault accordingly.

- [ ] **Step 4: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/InboundSyncService.ts
git commit -m "feat: add InboundSyncService for AaaS-driven data sync

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: WebhookController — dispatch all 5 ontologies

**Files:**
- Modify: `api/src/controllers/WebhookController.ts`

**Interfaces:**
- Consumes: `syncCommunityFromEvault`, `syncMeetingFromEvault`, `syncPollFromEvault`, `syncVoteFromEvault` from InboundSyncService; `ONTOLOGIES` from `api/src/lib/w3ds/ontology.ts`
- Produces: webhook handler dispatches on Community/Meeting/Poll/Vote alongside existing User handler

- [ ] **Step 1: Update imports in WebhookController.ts**

At the top of `api/src/controllers/WebhookController.ts`, add:
```typescript
import {
    syncCommunityFromEvault,
    syncMeetingFromEvault,
    syncPollFromEvault,
    syncVoteFromEvault,
} from "../services/InboundSyncService";
import { ONTOLOGIES } from "../lib/w3ds/ontology";
```

- [ ] **Step 2: Update the dispatch section**

Find the existing dispatch block:
```typescript
try {
    if (ontology === SCHEMA_USER && vaultEname && data) {
        await this.handleUserProfileUpdate(vaultEname, data);
    }
    // Future: handle community/meeting/poll/vote updates from external apps
} catch (err) {
    console.error("[W3DS webhook] dispatch error:", err);
}
```

Replace with:
```typescript
try {
    if (!ontology || !data) return;

    if (ontology === ONTOLOGIES.User && vaultEname) {
        await this.handleUserProfileUpdate(vaultEname, data);
    } else if (ontology === ONTOLOGIES.Community && vaultEname) {
        await syncCommunityFromEvault(vaultEname, data);
    } else if (ontology === ONTOLOGIES.Meeting && metaEnvelopeId) {
        await syncMeetingFromEvault(metaEnvelopeId, data);
    } else if (ontology === ONTOLOGIES.Poll && metaEnvelopeId) {
        await syncPollFromEvault(metaEnvelopeId, data);
    } else if (ontology === ONTOLOGIES.Vote && metaEnvelopeId) {
        await syncVoteFromEvault(metaEnvelopeId, data);
    }
} catch (err) {
    logger.error({ err, ontology, metaEnvelopeId }, "[W3DS webhook] dispatch error");
}
```

Also replace the `console.error` in the try/catch import with `logger.error` (import `logger` from `"../lib/logger"` if not already imported).

Remove the now-redundant `const SCHEMA_USER = USER_ONTOLOGY;` line (replace its usage with `ONTOLOGIES.User`).

- [ ] **Step 3: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/controllers/WebhookController.ts
git commit -m "feat: WebhookController dispatches all 5 W3DS ontologies

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: AaaSService — expand to all 5 ontologies

**Files:**
- Modify: `api/src/services/AaaSService.ts`

**Interfaces:**
- Consumes: `ONTOLOGIES` from ontology.ts; `syncCommunityFromEvault` etc. from InboundSyncService
- Produces: polls all 5 ontologies every 60s with per-ontology cursors; `Promise.allSettled` so one failing ontology doesn't block others

- [ ] **Step 1: Rewrite AaaSService.ts**

The current AaaSService already uses correct auth/params/response for `USER_ONTOLOGY`. Extend it to cover all 5:

```typescript
import { ONTOLOGIES } from "../lib/w3ds/ontology";
import { syncMemberFromEvaultProfile } from "./MemberSyncService";
import {
    syncCommunityFromEvault,
    syncMeetingFromEvault,
    syncPollFromEvault,
    syncVoteFromEvault,
} from "./InboundSyncService";
import { logger } from "../lib/logger";

const AAAS_URL = process.env.AAAS_BASE_URL || "https://aaas.w3ds.metastate.foundation";

const POLL_ONTOLOGIES = [
    ONTOLOGIES.User,
    ONTOLOGIES.Community,
    ONTOLOGIES.Meeting,
    ONTOLOGIES.Poll,
    ONTOLOGIES.Vote,
] as const;

type OntologyId = typeof POLL_ONTOLOGIES[number];

interface AaaSPacket {
    id: string;
    w3id: string;
    ontology: string;
    data: Record<string, unknown> | null;
}

interface PacketsPage {
    packets: AaaSPacket[];
    hasMore?: boolean;
    nextCursor?: string | null;
}

// Per-ontology cursor — resets on restart, re-processes last 5 min as safe fallback.
const lastCursors = new Map<string, string>(
    POLL_ONTOLOGIES.map(id => [id, new Date(Date.now() - 5 * 60 * 1000).toISOString()])
);

async function fetchPage(ontology: string, cursor?: string): Promise<PacketsPage> {
    const apiKey = process.env.AAAS_API_KEY;
    if (!apiKey) return { packets: [] };

    const from = lastCursors.get(ontology) ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const params = new URLSearchParams({ ontology, from, limit: "100" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${AAAS_URL}/api/packets?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AaaS HTTP ${res.status} for ontology ${ontology}`);
    const body = await res.json() as PacketsPage;
    return { packets: body.packets ?? [], hasMore: body.hasMore, nextCursor: body.nextCursor };
}

async function dispatchPacket(pkt: AaaSPacket): Promise<void> {
    if (!pkt.data) return;
    switch (pkt.ontology) {
        case ONTOLOGIES.User:
            await syncMemberFromEvaultProfile(pkt.w3id, pkt.data);
            break;
        case ONTOLOGIES.Community:
            await syncCommunityFromEvault(pkt.w3id, pkt.data);
            break;
        case ONTOLOGIES.Meeting:
            await syncMeetingFromEvault(pkt.id, pkt.data);
            break;
        case ONTOLOGIES.Poll:
            await syncPollFromEvault(pkt.id, pkt.data);
            break;
        case ONTOLOGIES.Vote:
            await syncVoteFromEvault(pkt.id, pkt.data);
            break;
    }
}

async function pollOntology(ontology: OntologyId): Promise<void> {
    const pollStartedAt = new Date().toISOString();
    let cursor: string | undefined;
    let total = 0;

    for (let page = 0; page < 50; page++) {
        const { packets, hasMore, nextCursor } = await fetchPage(ontology, cursor);
        total += packets.length;
        for (const pkt of packets) {
            await dispatchPacket(pkt).catch(err =>
                logger.warn({ err, packetId: pkt.id, ontology }, '[AaaS] Failed to process packet')
            );
        }
        if (!hasMore || !nextCursor) break;
        cursor = nextCursor;
    }

    if (total > 0) logger.info({ ontology, total }, '[AaaS] Packets processed');
    lastCursors.set(ontology, pollStartedAt);
}

export async function pollOnce(): Promise<void> {
    if (!process.env.AAAS_API_KEY) return;
    await Promise.allSettled(POLL_ONTOLOGIES.map(pollOntology));
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs = 60_000): void {
    if (!process.env.AAAS_API_KEY) {
        logger.info('[AaaS] AAAS_API_KEY not set — polling disabled');
        return;
    }
    if (pollInterval) return;
    logger.info({ intervalMs }, '[AaaS] Polling started');
    pollOnce();
    pollInterval = setInterval(pollOnce, intervalMs);
}

export function stopPolling(): void {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
```

- [ ] **Step 2: Remove now-unused USER_ONTOLOGY export from MemberSyncService if it was the only consumer**

```bash
grep -rn "USER_ONTOLOGY" /home/serzhilin/Projects/ALVer/api/src/ | grep -v "node_modules"
```

If only used in AaaSService (now removed) and WebhookController (now using ONTOLOGIES.User), remove the export from MemberSyncService or leave it — either is fine.

- [ ] **Step 3: Document AAAS_API_KEY in .env.example**

```bash
cat /home/serzhilin/Projects/ALVer/api/.env.example 2>/dev/null || cat /home/serzhilin/Projects/ALVer/.env.example 2>/dev/null
```

Find and read the env example file. Add if not present:
```
# AaaS polling key — obtained from W3DS portal (separate from DEVELOPER_API_KEY)
AAAS_API_KEY=aaas_your_key_here
```

- [ ] **Step 4: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/AaaSService.ts api/src/services/MemberSyncService.ts
git commit -m "feat: AaaSService polls all 5 W3DS ontologies with per-ontology cursors

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start dev environment**

```bash
cd /home/serzhilin/Projects/ALVer
docker compose up -d
cd api && npm run dev
```

Wait for `"[AaaS] Polling started"` log line.

- [ ] **Step 2: Verify all 5 ontologies polling**

With `AAAS_API_KEY` set in `.env`, the startup log should show the polling started. If packets exist on AaaS, they'll be processed. With no key, confirm the service logs `"AAAS_API_KEY not set — polling disabled"`.

- [ ] **Step 3: Verify webhook dispatches**

Send a test webhook payload for Community ontology:
```bash
curl -s -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-meta-envelope-id",
    "w3id": "@test-community-ename",
    "ontology": "550e8400-e29b-41d4-a716-446655440003",
    "data": { "name": "Updated Name" }
  }' | jq .
```

Expected: `{ "received": true }`. API log should show `[InboundSync] Community not found locally, skipping` (since no community with that ename exists) — that's correct behavior.

- [ ] **Step 4: Send Meeting webhook**

```bash
curl -s -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nonexistent-global-id",
    "w3id": "@some-ename",
    "ontology": "880e8400-e29b-41d4-a716-446655440099",
    "data": { "title": "Updated Meeting" }
  }' | jq .
```

Expected: `{ "received": true }`. Log: `[InboundSync] Meeting not found in mapping table, skipping`.

- [ ] **Step 5: Final commit if fixes needed**

```bash
cd /home/serzhilin/Projects/ALVer
git add -p
git commit -m "fix: smoke test corrections for phase 2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
