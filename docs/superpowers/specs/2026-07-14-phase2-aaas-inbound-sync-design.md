# Phase 2: AaaS-Driven Inbound Sync Design

**Date:** 2026-07-14
**Status:** Approved

## Goal

Make the ALVer database a true cache of eVault data. Any change to ALVer-related envelopes in eVault — from another platform, a direct edit, or another ALVer instance — propagates back to the local DB via AaaS polling and webhook delivery.

## Context

Currently AaaS polling and the webhook controller only handle the User profile ontology (`550e8400-...-000`). All other ontologies are outbound-only: ALVer writes to eVault but never reads back external changes. Phase 1 already marks community data as read-only (ALVer doesn't write it). Phase 2 extends inbound sync to all five ontologies ALVer touches.

Reference: `~/Projects/CORE/api/src/services/AaaSService.ts` for correct AaaS auth (`AAAS_API_KEY`), query params (`ontology`, `from`, `limit`, `cursor`), and response shape (`{ packets, hasMore, nextCursor }`).

---

## Architecture

### Data flow

```
eVault change
  → AaaS ingests packet
  → ALVer webhook (real-time) OR AaaS poll (fallback, 60s)
  → InboundSyncService
  → DB update
```

### Anti-echo

The subscriber writes outbound; eVault fires AaaS; AaaS hits ALVer's webhook. Without protection this loops. Guard: every inbound handler checks `adapter.lockedIds.includes(globalId)` before applying. The subscriber locks `globalId` during the outbound write window — same mechanism already used for the User sync.

### What syncs inbound

| Ontology | Schema ID | Table | Fields synced |
|---|---|---|---|
| User | `550e8400-e29b-41d4-a716-446655440000` | `members` | `display_name`, `first_name`, `last_name`, `avatar_url` (already implemented) |
| Community | `550e8400-e29b-41d4-a716-446655440003` | `communities` | `name`, `logo_url`, `description` |
| Meeting | `880e8400-e29b-41d4-a716-446655440099` | `meetings` | `name`, `startDateTime`, `endDateTime` |
| Poll | `660e8400-e29b-41d4-a716-446655440100` | `polls` | `motion_text`, `options`, `mode`, `votingWeight`, `closed_at` |
| Vote | `660e8400-e29b-41d4-a716-446655440101` | `votes` | `data` (vote payload) |

### External creation not supported

Inbound sync only **updates** existing local rows — it does not create them. ALVer is the authoritative creator of meetings, polls, and votes. If a globalId has no matching local row, the inbound handler logs and returns. Community rows are created only via the linking flow (Phase 1).

---

## Backend

### New: `api/src/services/InboundSyncService.ts`

One exported function per ontology. Each follows the same pattern:

```typescript
// Community: look up by vaultEname (community ename), patch name/logo/description
export async function syncCommunityFromEvault(
    vaultEname: string,
    data: Record<string, unknown>
): Promise<void>

// Meeting/Poll/Vote: look up local entity via mappingDb.getLocalId(globalId)
export async function syncMeetingFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void>

export async function syncPollFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void>

export async function syncVoteFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void>
```

**Field mapping** (universal → local, inverted from `localToUniversalMap`):

Community (`data` keys are Chat envelope field names):
```
data.name        → communities.name
data.avatar      → communities.logo_url
data.description → communities.description
```

Meeting:
```
data.title → meetings.name
data.start → meetings.startDateTime
data.end   → meetings.endDateTime
```

Poll:
```
data.title        → polls.motion_text
data.options      → polls.options
data.mode         → polls.mode
data.votingWeight → polls.votingWeight
data.deadline     → polls.closed_at
```

Vote:
```
data.data → votes.data
```

All syncs are non-destructive: only update fields that are present and non-null in the incoming packet. Never null-out an existing value from a partial packet.

### Updated: `api/src/controllers/WebhookController.ts`

Add dispatch for 4 new ontologies alongside existing User handler:

```typescript
const ONTOLOGY_HANDLERS: Record<string, (globalId: string, vaultEname: string, data: Record<string, unknown>) => Promise<void>> = {
    [ONTOLOGIES.User]:      (_, ename, data) => syncMemberFromEvaultProfile(ename, data),
    [ONTOLOGIES.Community]: (_, ename, data) => syncCommunityFromEvault(ename, data),
    [ONTOLOGIES.Meeting]:   (id, _, data)    => syncMeetingFromEvault(id, data),
    [ONTOLOGIES.Poll]:      (id, _, data)    => syncPollFromEvault(id, data),
    [ONTOLOGIES.Vote]:      (id, _, data)    => syncVoteFromEvault(id, data),
};
```

Anti-echo check before dispatching:
```typescript
const globalId = packet.id;
if (adapter.lockedIds.includes(globalId)) return; // our own write, skip
const handler = ONTOLOGY_HANDLERS[ontology];
if (!handler) return;
res.status(200).json({ received: true }); // respond first
handler(globalId, vaultEname, data).catch(err => logger.error(err));
```

### Updated: `api/src/services/AaaSService.ts`

**Auth fix** (mirror from CORE): use `AAAS_API_KEY` env var, not `DEVELOPER_API_KEY`. These are different credentials — `DEVELOPER_API_KEY` is for eVault GraphQL only; AaaS requires a portal-issued `aaas_…` consumer key.

**Query params fix** (mirror from CORE): use `ontology`, `from`, `limit`, `cursor` — not `since`/`ontologyId`/`pageSize`.

**Response shape fix** (mirror from CORE): parse `res.data.packets` array + `hasMore`/`nextCursor` for pagination — not a bare array.

**Expand to all 5 ontologies:**

```typescript
const POLL_ONTOLOGIES = [
    ONTOLOGIES.User,
    ONTOLOGIES.Community,
    ONTOLOGIES.Meeting,
    ONTOLOGIES.Poll,
    ONTOLOGIES.Vote,
] as const;
```

**Separate cursor per ontology**: store `lastPolledAt` per ontology key so a slow or empty ontology doesn't block others. Use a `Map<string, string>` in module state, persisted across poll cycles within a process lifetime (non-persistent — on restart, polls from `now - 1h` as safe fallback).

```typescript
const lastCursors = new Map<string, string>(); // ontologyId → ISO timestamp

async function pollOntology(ontologyId: string): Promise<void> {
    const from = lastCursors.get(ontologyId) ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // paginate: while hasMore, follow nextCursor
    // dispatch each packet to webhook handler logic (reuse InboundSyncService directly)
    lastCursors.set(ontologyId, new Date().toISOString());
}

export async function pollOnce(): Promise<void> {
    await Promise.allSettled(POLL_ONTOLOGIES.map(pollOntology));
}
```

`Promise.allSettled` — one ontology failing does not block others.

### New env var

```env
AAAS_API_KEY=aaas_<portal-issued-key>
```

Document in `.env.example`. The existing `DEVELOPER_API_KEY` stays for eVault GraphQL writes.

### New constant file: `api/src/lib/w3ds/ontology.ts`

```typescript
export const ONTOLOGIES = {
    User:      '550e8400-e29b-41d4-a716-446655440000',
    Community: '550e8400-e29b-41d4-a716-446655440003',
    Meeting:   '880e8400-e29b-41d4-a716-446655440099',
    Poll:      '660e8400-e29b-41d4-a716-446655440100',
    Vote:      '660e8400-e29b-41d4-a716-446655440101',
} as const;
```

Replace all inline string literals in `MemberSyncService.ts`, `AaaSService.ts`, `WebhookController.ts`, `evault.ts` with references to this constant.

---

## What does NOT change

- Outbound sync (subscriber) — unchanged; meetings/polls/votes still write to eVault on creation/update
- Member management (add/remove members from community) — DB-primary, no inbound sync of member list from Chat `participantIds` (complex MetaEnvelope ID → eName resolution deferred)
- Vote data integrity — `syncVoteFromEvault` only patches `data` field; does not allow changing `voter_ename` or `poll_id`

---

## Testing

After Phase 2 ships:
1. Change community name directly in eVault GraphQL → verify DB updates within 60s
2. Edit meeting title in eVault → verify meeting row updates
3. Cast a vote via eVoting platform → verify vote row appears (requires Phase 3 for field alignment)
4. Verify no echo loop: ALVer creates poll → subscriber fires → AaaS picks up → webhook fires → no DB double-write
