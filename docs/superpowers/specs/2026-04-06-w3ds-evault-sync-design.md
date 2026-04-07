# ALVer — W3DS eVault Sync Design

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Add eVault sync to the fully-working ALVer app. Postgres remains source of truth; eVaults are secondary sync targets.

---

## Context

ALVer is a cooperative meeting platform (Express + TypeORM + PostgreSQL + React/Vite). As of this spec:

- eID authentication (Phase 1) is **fully implemented and working** — `AuthController.ts` handles the full W3DS auth flow, JWT issuance, SSE for desktop, and dev-login fallback
- Community + Member entities (Phase 2) are **fully implemented** — communities exist in Postgres with member lists and facilitator roles
- eVault sync (Phases 3–5 of the old plan) is **not yet implemented** — `subscriber.ts` is a stub

This spec covers only the eVault sync layer.

---

## Architecture

```
ALVer (Postgres — source of truth)
         │
         │  TypeORM EntitySubscriber
         │  (afterInsert / afterUpdate, 3-second async debounce)
         ▼
    Web3Adapter
         │
         ├─► User's personal eVault   (profile data only)
         └─► Community group eVault   (all meeting/voting data)
```

**Key principles:**
- Postgres never waits for the eVault. Sync is fire-and-forget.
- If the eVault is unreachable, the app keeps working normally.
- Rows with a null `ename` path (e.g. manual check-ins without a W3DS identity) are silently skipped.
- The subscriber uses `lockedIds` to prevent webhook-triggered re-syncs from looping.

---

## Entity → eVault Mapping

| Entity | Target eVault | `ownerEnamePath` |
|--------|--------------|-----------------|
| `User` | Personal | `ename` |
| `Community` | Group | `ename` |
| `Meeting` | Group | `groups(community.ename)` |
| `Attendee` | Group | `groups(meeting.community.ename)` |
| `Poll` | Group | `groups(meeting.community.ename)` |
| `Vote` | Group | `groups(poll.meeting.community.ename)` |
| `Decision` | Group | `groups(meeting.community.ename)` |

**Rationale for votes → group eVault:**
In a cooperative meeting, the vote record belongs to the group's decision history, not to individual members. This matches the eVoting reference implementation (`platforms/evoting`) where `vote.mapping.json` uses `ownerEnamePath: "groups(poll.group.ename)"`.

**ownerEnamePath syntax note:**
The web3-adapter only traverses dot-notation when wrapped in `xxx(path)` form. Without parens, the value is read as a flat key from the entity. So `"community.ename"` reads `data["community.ename"]` (always undefined), while `"groups(community.ename)"` reads `data.community.ename` via path traversal. The prefix label (`groups`, `users`, etc.) is semantic only.

**Decision note:**
`Decision` has `meeting_id` but no TypeORM `meeting` relation. In the subscriber, load the meeting manually via `AppDataSource.getRepository(Meeting).findOne({ where: { id: decision.meeting_id }, relations: ["community"] })` and attach it as `decision.meeting` before calling `adapter.handleChange`.

---

## Community Entity Changes

`Community` needs two new nullable fields:

```typescript
@Column({ nullable: true })
ename!: string;          // W3ID of this community's group eVault

@Column({ nullable: true })
evault_uri!: string;     // provisioned eVault base URL
```

Both nullable so the app works before provisioning runs.

---

## Group eVault Provisioning

A one-time script provisions a W3DS identity for each Community. Pattern from `platforms/group-charter-manager/api/src/scripts/migrate-eVaults.ts`.

```typescript
import { createGroupEVault } from "web3-adapter";

const result = await createGroupEVault(
    process.env.PUBLIC_REGISTRY_URL,
    process.env.PUBLIC_PROVISIONER_URL,
    {
        name: community.name,
        description: `${community.name} — cooperative meeting community`,
        members: [],  // populated later via Member sync
        admins: [],
        owner: community.facilitator_ename,
    }
);

community.ename = result.w3id;
community.evault_uri = result.uri;
await communityRepo.save(community);
```

Script lives at `api/src/scripts/provision-communities.ts`. Run once per environment after Community rows exist.

Required env vars: `PUBLIC_REGISTRY_URL`, `PUBLIC_PROVISIONER_URL`

---

## Mapping Files

Seven files in `api/src/web3adapter/mappings/`. Schema UUIDs for ALVer-specific types are generated once and committed to `.env`.

### `user.mapping.json`
```json
{
  "tableName": "users",
  "schemaId": "550e8400-e29b-41d4-a716-446655440000",
  "ownerEnamePath": "ename",
  "readOnly": true,
  "localToUniversalMap": {
    "first_name": "firstName",
    "last_name": "lastName",
    "ename": "ename"
  }
}
```

### `community.mapping.json`
```json
{
  "tableName": "communities",
  "schemaId": "550e8400-e29b-41d4-a716-446655440003",
  "ownerEnamePath": "ename",
  "localToUniversalMap": {
    "name": "name",
    "slug": "slug",
    "ename": "ename",
    "facilitator_ename": "owner"
  }
}
```

### `meeting.mapping.json`
```json
{
  "tableName": "meetings",
  "schemaId": "ALVER-MEETING-UUID",
  "ownerEnamePath": "groups(community.ename)",
  "localToUniversalMap": {
    "name": "name",
    "date": "date",
    "time": "time",
    "location": "location",
    "agenda_text": "agendaText",
    "status": "status",
    "community_id": "communityId"
  }
}
```

### `attendee.mapping.json`
```json
{
  "tableName": "attendees",
  "schemaId": "ALVER-ATTENDEE-UUID",
  "ownerEnamePath": "groups(meeting.community.ename)",
  "localToUniversalMap": {
    "attendee_name": "memberName",
    "attendee_ename": "memberEname",
    "meeting_id": "meetingId",
    "checked_in_at": "checkedInAt",
    "method": "checkInMethod",
    "status": "status"
  }
}
```

### `poll.mapping.json`
```json
{
  "tableName": "polls",
  "schemaId": "ALVER-POLL-UUID",
  "ownerEnamePath": "groups(meeting.community.ename)",
  "localToUniversalMap": {
    "motion_text": "motionText",
    "vote_options": "voteOptions",
    "status": "status",
    "meeting_id": "meetingId",
    "opened_at": "openedAt",
    "closed_at": "closedAt"
  }
}
```

### `vote.mapping.json`
```json
{
  "tableName": "votes",
  "schemaId": "ALVER-VOTE-UUID",
  "ownerEnamePath": "groups(poll.meeting.community.ename)",
  "localToUniversalMap": {
    "voter_ename": "voterEname",
    "voter_name": "voterName",
    "poll_id": "pollId",
    "option_id": "optionId",
    "cast_at": "castAt",
    "method": "method",
    "on_behalf_of_ename": "onBehalfOfEname",
    "on_behalf_of_name": "onBehalfOfName",
    "signature": "signature"
  }
}
```

### `decision.mapping.json`
```json
{
  "tableName": "decisions",
  "schemaId": "ALVER-DECISION-UUID",
  "ownerEnamePath": "groups(meeting.community.ename)",
  "localToUniversalMap": {
    "motion_text": "motionText",
    "result": "result",
    "breakdown": "breakdown",
    "total_votes": "totalVotes",
    "closed_at": "closedAt",
    "facilitator_signature": "facilitatorSignature",
    "poll_id": "pollId"
  }
}
```

> **Before starting implementation:** generate UUIDs for the five ALVer-specific schemas and replace the `ALVER-*-UUID` placeholders. Add them to `.env` for reference.

---

## EntitySubscriber

Replace the stub at `api/src/web3adapter/subscriber.ts` with the full TypeORM subscriber pattern from eVoting (`platforms/evoting/api/src/web3adapter/watchers/subscriber.ts`).

Key rules:
1. **Load relations inside the 3-second timeout** — never before. Entity state at event time may be partial.
2. **Check `lockedIds`** — if the globalId is locked, skip. Prevents webhook → sync → webhook loops.
3. **Null guard** — resolve the `ownerEnamePath` chain; if any step is null (e.g. `meeting.community.ename` where community has no ename), return early.
4. **Register in `data-source.ts`**: `subscribers: [AlverSubscriber]`

The subscriber handles all 7 entity types. The web3-adapter reads the mapping files at startup and routes each entity to the correct eVault automatically.

---

## Web3-Adapter Dependency

Follow the `signature-validator` precedent: inline the adapter or use a `file:` path in `api/package.json`.

```json
"web3-adapter": "file:../../../metastate/prototype/infrastructure/web3-adapter"
```

Build first: `pnpm --filter web3-adapter build` in `metastate/prototype`.

Required env vars:
```env
PUBLIC_REGISTRY_URL=https://registry.w3ds.metastate.foundation
PUBLIC_PROVISIONER_URL=https://provisioner.w3ds.metastate.foundation
ALVER_MAPPING_DB_PATH=/absolute/path/to/api/data/mapping.db
```

---

## Schema UUIDs

| Schema | ID |
|--------|----|
| User profile | `550e8400-e29b-41d4-a716-446655440000` (W3DS standard) |
| Group manifest | `550e8400-e29b-41d4-a716-446655440003` (W3DS standard) |
| Meeting | generate new |
| Attendee | generate new |
| Poll | generate new |
| Vote | generate new |
| Decision | generate new |

Generate with `node -e "const {v4}=require('uuid'); console.log(v4())"` × 5.

---

## What Does NOT Change

- All existing meeting flows, SSE, real-time sync
- All frontend views (no changes needed)
- Postgres schema except the two new Community columns
- Authentication — already working

---

## File Checklist

```
api/src/
  database/entities/Community.ts          ← add ename + evault_uri fields
  database/migrations/<ts>-community-w3ds.ts
  scripts/provision-communities.ts        ← new, one-time provisioning
  web3adapter/
    subscriber.ts                         ← replace stub with full impl
    mappings/
      user.mapping.json                   ← new
      community.mapping.json              ← new
      meeting.mapping.json                ← new
      attendee.mapping.json               ← new
      poll.mapping.json                   ← new
      vote.mapping.json                   ← new
      decision.mapping.json               ← new
  database/data-source.ts                 ← register AlverSubscriber
api/package.json                          ← add web3-adapter dep
.env                                      ← add PROVISIONER_URL, MAPPING_DB_PATH, schema UUIDs
```
