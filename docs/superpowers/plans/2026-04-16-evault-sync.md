# ALVer eVault Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all W3DS eVault schema IDs, rewrite mapping JSONs, and extend the subscriber to enrich entities and trigger parent re-syncs for embedded child entities (Attendee, Mandate, Decision, Member).

**Architecture:** Mapping JSONs are declarative — rewriting them fixes schema IDs and field names with zero runtime risk. The subscriber gains one new constant (`PARENT_TRIGGER_MAP`), one new private method (`syncParent`), one new async private method (`enrichEntity`), and updates to `getRelations` and `loadAndEnrich`. All changes are additive to the existing `afterInsert`/`afterUpdate` shape. The app never awaits sync; errors are caught and logged.

**Tech Stack:** TypeScript, TypeORM, SQLite (mappings.db), W3DS web3-adapter (vendored), Express API at `~/Projects/ALVer/api/`.

**Spec:** `docs/superpowers/specs/2026-04-16-evault-sync-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `api/mappings/attendee.mapping.json` | **Delete** | Attendees now embedded in Meeting envelope |
| `api/mappings/decision.mapping.json` | **Delete** | Decision now embedded in Poll envelope |
| `api/mappings/community.mapping.json` | **Rewrite** | GroupManifest schema, correct UUID, members/admins fields |
| `api/mappings/meeting.mapping.json` | **Rewrite** | CalendarEvent schema, correct ownerEnamePath, embedded attendees/mandates |
| `api/mappings/poll.mapping.json` | **Rewrite** | Poll schema, correct UUID, W3DS field names, embedded decision |
| `api/mappings/vote.mapping.json` | **Rewrite** | Vote schema, correct UUID, W3DS data format |
| `api/src/web3adapter/subscriber.ts` | **Rewrite** | PARENT_TRIGGER_MAP, syncParent, enrichEntity, getRelations update |
| `api/data/mappings.db` | **Manual step** | Clear `id_mappings` table (stale entries with wrong schema IDs) |

---

## Task 1: Delete orphaned mapping files

**Files:**
- Delete: `api/mappings/attendee.mapping.json`
- Delete: `api/mappings/decision.mapping.json`

- [ ] **Step 1: Delete both files**

```bash
cd ~/Projects/ALVer
rm api/mappings/attendee.mapping.json
rm api/mappings/decision.mapping.json
```

- [ ] **Step 2: Verify they are gone**

```bash
ls api/mappings/
```

Expected output:
```
community.mapping.json  meeting.mapping.json  poll.mapping.json  user.mapping.json  vote.mapping.json
```

- [ ] **Step 3: Commit**

```bash
git add -A api/mappings/attendee.mapping.json api/mappings/decision.mapping.json
git commit -m "feat(w3ds): remove attendee + decision mapping files

Attendees and mandates are now embedded in the Meeting CalendarEvent
envelope. Decisions are embedded in the Poll envelope. Neither entity
syncs to eVault independently.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite community.mapping.json

**Files:**
- Modify: `api/mappings/community.mapping.json`

- [ ] **Step 1: Overwrite the file**

Replace the entire contents of `api/mappings/community.mapping.json` with:

```json
{
  "tableName": "communities",
  "schemaId": "a8bfb7cf-3200-4b25-9ea9-ee41100f212e",
  "ownerEnamePath": "ename",
  "localToUniversalMap": {
    "name": "name",
    "ename": "eName",
    "facilitator_ename": "owner",
    "admins": "admins",
    "members": "members",
    "logo_url": "avatar",
    "slug": "slug",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('api/mappings/community.mapping.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add api/mappings/community.mapping.json
git commit -m "feat(w3ds): fix community mapping — GroupManifest UUID + members/admins fields

Was using Chat UUID (550e8400-...0003). Now uses GroupManifest
(a8bfb7cf-...212e). Adds admins and members computed fields.
ename maps to eName (GroupManifest field name).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Rewrite meeting.mapping.json

**Files:**
- Modify: `api/mappings/meeting.mapping.json`

- [ ] **Step 1: Overwrite the file**

Replace the entire contents of `api/mappings/meeting.mapping.json` with:

```json
{
  "tableName": "meetings",
  "schemaId": "880e8400-e29b-41d4-a716-446655440099",
  "ownerEnamePath": "communities(community.ename)",
  "localToUniversalMap": {
    "name": "title",
    "startDateTime": "start",
    "endDateTime": "end",
    "location": "location",
    "agenda_text": "agendaText",
    "status": "status",
    "facilitator_ename": "facilitatorEname",
    "minutes_html": "minutesHtml",
    "minutes_status": "minutesStatus",
    "attendees": "attendees",
    "mandates": "mandates"
  }
}
```

Key changes from old file:
- `schemaId` was a nonexistent UUID — now `880e8400-...0099` (CalendarEvent)
- `ownerEnamePath` was `groups(community.ename)` — now `communities(community.ename)` matching the community `tableName`
- `startDateTime`/`endDateTime` replace raw `date`/`time` columns (computed by subscriber)
- `attendees` and `mandates` are embedded arrays (computed by subscriber)

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('api/mappings/meeting.mapping.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add api/mappings/meeting.mapping.json
git commit -m "feat(w3ds): fix meeting mapping — CalendarEvent UUID, correct ownerEnamePath

Was using nonexistent UUID and groups(...) path (no groups tableName exists).
Now uses CalendarEvent (880e8400-...0099) and communities(...) path.
Adds embedded attendees, mandates, computed start/end datetimes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Rewrite poll.mapping.json and vote.mapping.json

**Files:**
- Modify: `api/mappings/poll.mapping.json`
- Modify: `api/mappings/vote.mapping.json`

- [ ] **Step 1: Overwrite poll.mapping.json**

Replace the entire contents of `api/mappings/poll.mapping.json` with:

```json
{
  "tableName": "polls",
  "schemaId": "660e8400-e29b-41d4-a716-446655440100",
  "ownerEnamePath": "communities(meeting.community.ename)",
  "localToUniversalMap": {
    "id": "id",
    "motion_text": "title",
    "options": "options",
    "mode": "mode",
    "votingWeight": "votingWeight",
    "meeting": "communities(meeting.community_id),group",
    "closed_at": "deadline",
    "status": "status",
    "meeting_id": "meetingId",
    "facilitator_ename": "facilitatorEname",
    "decision": "decision",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

- [ ] **Step 2: Overwrite vote.mapping.json**

Replace the entire contents of `api/mappings/vote.mapping.json` with:

```json
{
  "tableName": "votes",
  "schemaId": "660e8400-e29b-41d4-a716-446655440101",
  "ownerEnamePath": "communities(poll.meeting.community.ename)",
  "localToUniversalMap": {
    "id": "id",
    "poll": "polls(poll_id),poll",
    "voter_ename": "voterId",
    "data": "data",
    "method": "method",
    "on_behalf_of_ename": "onBehalfOfEname",
    "on_behalf_of_name": "onBehalfOfName",
    "cast_at": "createdAt"
  }
}
```

- [ ] **Step 3: Verify both files are valid JSON**

```bash
node -e "
  JSON.parse(require('fs').readFileSync('api/mappings/poll.mapping.json','utf8'));
  JSON.parse(require('fs').readFileSync('api/mappings/vote.mapping.json','utf8'));
  console.log('both valid');
"
```

Expected: `both valid`

- [ ] **Step 4: Commit**

```bash
git add api/mappings/poll.mapping.json api/mappings/vote.mapping.json
git commit -m "feat(w3ds): fix poll + vote mappings — correct UUIDs and W3DS field names

Poll: was abe892b9 (nonexistent) → 660e8400-...0100 (Poll schema).
  motion_text→title, vote_options→options (labels only), embedded decision.
Vote: was 51cb0bfe (nonexistent) → 660e8400-...0101 (Vote schema).
  option_id wrapped into W3DS data.mode=normal format.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Rewrite subscriber.ts

**Files:**
- Modify: `api/src/web3adapter/subscriber.ts`

This is a full rewrite of the 122-line file. The public shape (`afterInsert`, `afterUpdate`) is unchanged. All new behaviour is in private methods.

- [ ] **Step 1: Replace subscriber.ts entirely**

Replace the full contents of `api/src/web3adapter/subscriber.ts` with:

```typescript
import {
    EventSubscriber,
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
} from "typeorm";
import { Web3Adapter } from "web3-adapter";
import path from "path";
import dotenv from "dotenv";
import { AppDataSource } from "../database/data-source";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

export const adapter = new Web3Adapter({
    schemasPath: path.resolve(__dirname, "../../mappings/"),
    dbPath: path.resolve(process.env.ALVER_MAPPING_DB_PATH as string),
    registryUrl: process.env.PUBLIC_REGISTRY_URL as string,
    platform: process.env.VITE_PUBLIC_ALVER_BASE_URL as string,
});

// Child entities that trigger a parent re-sync instead of syncing themselves.
// Attendees + Mandates are embedded in the Meeting CalendarEvent envelope.
// Decisions are embedded in the Poll envelope.
// Members trigger a Community GroupManifest re-sync when ename is linked.
const PARENT_TRIGGER_MAP: Record<string, {
    parentTable: string;
    parentEntity: string;
    fk: string;
}> = {
    attendees: { parentTable: "meetings",    parentEntity: "Meeting",   fk: "meeting_id"   },
    mandates:  { parentTable: "meetings",    parentEntity: "Meeting",   fk: "meeting_id"   },
    decisions: { parentTable: "polls",       parentEntity: "Poll",      fk: "poll_id"      },
    members:   { parentTable: "communities", parentEntity: "Community", fk: "community_id" },
};

@EventSubscriber()
export class AlverSubscriber implements EntitySubscriberInterface {

    async afterInsert(event: InsertEvent<any>) {
        const entityId = event.entity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        const parentTrigger = PARENT_TRIGGER_MAP[tableName];

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    await this.syncParent(event.entity, parentTrigger);
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await adapter.handleChange({ data: enriched, tableName });
                }
            } catch (err) {
                console.error(`[W3DS] Sync failed (insert) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    async afterUpdate(event: UpdateEvent<any>) {
        const entityId = event.entity?.id ?? event.databaseEntity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        const parentTrigger = PARENT_TRIGGER_MAP[tableName];

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    // Reload the child to get FK — event.entity is often partial on updates
                    const repo = AppDataSource.getRepository(entityTarget);
                    const child = await repo.findOne({ where: { id: entityId } });
                    if (!child) return;
                    await this.syncParent(child, parentTrigger);
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await adapter.handleChange({ data: enriched, tableName });
                }
            } catch (err) {
                console.error(`[W3DS] Sync failed (update) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    // Loads a parent entity and re-syncs it when a child entity changes.
    private async syncParent(
        childEntity: any,
        trigger: { parentTable: string; parentEntity: string; fk: string }
    ): Promise<void> {
        const parentId = childEntity?.[trigger.fk];
        if (!parentId) return;

        const globalId = await adapter.mappingDb.getGlobalId(parentId) ?? "";
        if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(parentId)) return;

        const repo = AppDataSource.getRepository(trigger.parentEntity);
        const parent = await repo.findOne({
            where: { id: parentId },
            relations: this.getRelations(trigger.parentTable),
        });
        if (!parent) return;

        const plain = this.toPlain(parent);
        const enriched = await this.enrichEntity(plain, trigger.parentTable);
        await adapter.handleChange({ data: enriched, tableName: trigger.parentTable });
    }

    // Reloads entity from DB with all relations, then enriches with computed fields.
    private async loadAndEnrich(id: string, tableName: string, entityTarget: any): Promise<any | null> {
        try {
            const repo = AppDataSource.getRepository(entityTarget);
            const full = await repo.findOne({
                where: { id },
                relations: this.getRelations(tableName),
            });
            if (!full) return null;

            const plain = this.toPlain(full);
            return await this.enrichEntity(plain, tableName);
        } catch (err) {
            console.error(`[W3DS] loadAndEnrich failed for ${tableName}:`, err);
            return null;
        }
    }

    // Relations needed to traverse ownerEnamePath and load embedded child data.
    private getRelations(tableName: string): string[] {
        switch (tableName) {
            case "communities": return ["members"];
            case "meetings":    return ["community", "attendees", "mandates"];
            case "polls":       return ["meeting", "meeting.community"];
            case "votes":       return ["poll", "poll.meeting", "poll.meeting.community"];
            default:            return [];
        }
    }

    // Adds computed fields to the plain entity before eVault sync.
    private async enrichEntity(plain: Record<string, any>, tableName: string): Promise<Record<string, any>> {
        switch (tableName) {
            case "communities": {
                plain.admins = plain.facilitator_ename
                    ? [{ ename: plain.facilitator_ename, isChair: true }]
                    : [];
                plain.members = (plain.members ?? [])
                    .filter((m: any) => m.ename)
                    .map((m: any) => ({
                        ename:      m.ename,
                        name:       m.name,
                        isAspirant: m.is_aspirant ?? false,
                    }));
                break;
            }
            case "meetings": {
                plain.startDateTime = `${plain.date}T${plain.time}:00`;
                plain.endDateTime   = plain.end_time
                    ? `${plain.date}T${plain.end_time}:00`
                    : plain.startDateTime;
                plain.attendees = (plain.attendees ?? []).map((a: any) => ({
                    name:        a.attendee_name,
                    ename:       a.attendee_ename ?? null,
                    status:      a.status,
                    checkedInAt: a.checked_in_at ?? null,
                    method:      a.method,
                    isAspirant:  a.is_aspirant ?? false,
                }));
                plain.mandates = (plain.mandates ?? []).map((m: any) => ({
                    granterName:  m.granter_name,
                    granterEname: m.granter_ename ?? null,
                    proxyName:    m.proxy_name,
                    proxyEname:   m.proxy_ename ?? null,
                    scopeNote:    m.scope_note ?? null,
                    status:       m.status,
                    grantedAt:    m.granted_at ?? null,
                    revokedAt:    m.revoked_at ?? null,
                }));
                break;
            }
            case "polls": {
                plain.options      = (plain.vote_options ?? []).map((o: any) => o.label);
                plain.mode         = "normal";
                plain.votingWeight = "1p1v";
                const decision = await AppDataSource.getRepository("Decision").findOne({
                    where: { poll_id: plain.id },
                } as any) as any;
                plain.decision = decision ? {
                    result:               decision.result,
                    breakdown:            decision.breakdown,
                    totalVotes:           decision.total_votes,
                    closedAt:             decision.closed_at instanceof Date
                        ? decision.closed_at.toISOString()
                        : decision.closed_at,
                    facilitatorSignature: decision.facilitator_signature ?? null,
                } : null;
                break;
            }
            case "votes": {
                plain.data = { mode: "normal", data: [plain.option_id] };
                break;
            }
        }
        return plain;
    }

    private toPlain(entity: any): any {
        if (!entity || typeof entity !== "object") return entity;
        if (entity instanceof Date) return entity.toISOString();
        if (Array.isArray(entity)) return entity.map(i => this.toPlain(i));
        const plain: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(entity)) {
            if (k.startsWith("_")) continue;
            plain[k] = v instanceof Date ? v.toISOString()
                : Array.isArray(v) ? v.map(i => this.toPlain(i))
                : v && typeof v === "object" ? this.toPlain(v)
                : v;
        }
        return plain;
    }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

Expected: no errors. If there are errors, they will be type errors from the `as any` casts in `enrichEntity` — adjust the cast sites as needed. The `getRepository("Decision")` with a string name works in TypeORM when the entity is registered in `AppDataSource`.

- [ ] **Step 3: Verify API starts**

```bash
cd ~/Projects/ALVer/api && npm run dev
```

Expected: API starts without crash. Look for `[W3DS]` log lines — absence of crash is the signal, not specific log output. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/web3adapter/subscriber.ts
git commit -m "feat(w3ds): extend subscriber with enrichment + parent re-trigger pattern

- PARENT_TRIGGER_MAP: Attendee/Mandate → Meeting re-sync,
  Decision → Poll re-sync, Member → Community re-sync
- enrichEntity: computes startDateTime/endDateTime, attendees[],
  mandates[], options[], mode, votingWeight, decision, vote data
- getRelations: loads members for Community, attendees+mandates
  for Meeting, full community chain for Poll and Vote
- loadAndEnrich: now calls enrichEntity after toPlain
- syncParent: new method — loads parent and re-syncs when child changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Clear stale mappings DB and smoke test

**Files:**
- Manual: `api/data/mappings.db`

- [ ] **Step 1: Stop the API if running**

Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 2: Clear the id_mappings table**

```bash
sqlite3 ~/Projects/ALVer/api/data/mappings.db "DELETE FROM id_mappings;"
```

Verify it's empty:

```bash
sqlite3 ~/Projects/ALVer/api/data/mappings.db "SELECT COUNT(*) FROM id_mappings;"
```

Expected: `0`

- [ ] **Step 3: Restart the API**

```bash
cd ~/Projects/ALVer/api && npm run dev
```

Watch for startup logs. The adapter will reload all mapping JSONs on startup — no errors expected.

- [ ] **Step 4: Trigger Community re-sync**

In a separate terminal, trigger a no-op save on a community to make the adapter provision a fresh GroupManifest envelope. The easiest way is a direct DB touch:

```bash
sqlite3 ~/Projects/ALVer/api/data/alver.db \
  "UPDATE communities SET updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM communities LIMIT 1);"
```

Wait 5 seconds for the 3-second subscriber delay to complete. Check API logs for `[W3DS]` output — expect to see sync activity, not errors.

- [ ] **Step 5: Verify GroupManifest in eVault**

Query the local eVault GraphQL (if local stack is running at port 4000):

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ metaEnvelopes { id ontology payload } }"}' \
  | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const envs = d.data?.metaEnvelopes ?? [];
      envs.forEach(e => {
        if (e.ontology === 'a8bfb7cf-3200-4b25-9ea9-ee41100f212e') {
          console.log('GroupManifest found:', JSON.stringify(JSON.parse(e.payload), null, 2));
        }
      });
      if (!envs.some(e => e.ontology === 'a8bfb7cf-3200-4b25-9ea9-ee41100f212e'))
        console.log('No GroupManifest found yet — check API logs for errors');
  "
```

Expected: a GroupManifest envelope printed with correct `eName`, `name`, `owner`, `admins`, `members` (only those with ename).

- [ ] **Step 6: Smoke test attendee embedding**

In the ALVer app UI: open a meeting, check in an attendee. Wait 5 seconds, then query the eVault for the CalendarEvent:

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ metaEnvelopes { id ontology payload } }"}' \
  | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const envs = d.data?.metaEnvelopes ?? [];
      envs.filter(e => e.ontology === '880e8400-e29b-41d4-a716-446655440099')
        .forEach(e => console.log('CalendarEvent:', JSON.stringify(JSON.parse(e.payload), null, 2)));
  "
```

Expected: CalendarEvent payload includes `attendees` array with the checked-in attendee.

- [ ] **Step 7: Smoke test poll + vote embedding**

In the ALVer app UI: open a meeting, create a poll, cast a vote, close the poll (which creates a Decision). Wait 5 seconds, then query:

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ metaEnvelopes { id ontology payload } }"}' \
  | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const envs = d.data?.metaEnvelopes ?? [];
      envs.filter(e => e.ontology === '660e8400-e29b-41d4-a716-446655440100')
        .forEach(e => {
          const p = JSON.parse(e.payload);
          console.log('Poll:', p.title, '| decision:', p.decision?.result ?? 'none yet');
        });
      envs.filter(e => e.ontology === '660e8400-e29b-41d4-a716-446655440101')
        .forEach(e => {
          const p = JSON.parse(e.payload);
          console.log('Vote:', p.voterId, '| data:', JSON.stringify(p.data));
        });
  "
```

Expected:
- Poll envelope with `title` = motion text, `options` = label strings, `decision.result` set after poll close
- Vote envelope with `voterId` = voter ename, `data = { mode: "normal", data: ["option-id"] }`

- [ ] **Step 8: Final commit (smoke test results)**

If smoke tests pass, note results in commit message:

```bash
cd ~/Projects/ALVer
git add api/data/mappings.db
git commit -m "chore(w3ds): clear stale id_mappings after schema ID fix

Removed 39 entries that pointed to envelopes with wrong schema UUIDs.
Adapter will re-provision fresh envelopes with correct ontology IDs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 7 mapping changes covered (4 rewrites, 2 deletes, 1 user.mapping.json untouched — User schema was already correct). PARENT_TRIGGER_MAP covers all 4 child entities from spec. enrichEntity covers all 4 computed field sets. syncParent covers the parent re-sync flow. DB clear step covered in Task 6.
- [x] **No placeholders:** All steps have exact file contents, exact commands, expected outputs.
- [x] **Type consistency:** `enrichEntity(plain, tableName)` signature is consistent across all call sites. `syncParent` uses `trigger.parentTable` and `trigger.parentEntity` consistently. `getRelations(tableName)` called with the same string keys in `loadAndEnrich` and `syncParent`. `PARENT_TRIGGER_MAP` keys (`attendees`, `mandates`, `decisions`, `members`) match TypeORM `tableName` values from the entity `@Entity()` decorators.
- [x] **One gap fixed:** `user.mapping.json` is intentionally not changed — User schema (`550e8400-...0000`) and its mapping were already correct per prior research.
