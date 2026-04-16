# ALVer eVault Sync — Full Implementation Design

**Date:** 2026-04-16
**Status:** Approved, ready for implementation
**Scope:** Fix all W3DS schema IDs, rewrite mapping JSONs, extend subscriber enrichment, add parent re-trigger pattern for embedded entities, clear stale mappings DB.

---

## Context

ALVer is a cooperative meeting/voting app. Its data model is:

```
Community (group)
  └── Member[] (community members, some W3DS-linked via ename)
  └── Meeting[] (agenda meetings)
        └── Attendee[] (who attended)
        └── Mandate[] (proxy voting grants)
        └── Poll[] (motions voted on)
              └── Vote[] (individual votes)
              └── Decision (result + breakdown, one per poll)
```

The app works correctly. The W3DS eVault sync is broken — wrong schema IDs, wrong field mappings, orphaned entities (Attendee, Mandate, Decision) that never reach eVault. This spec fixes all of it without touching any app logic.

**Core constraint:** The subscriber is async and fire-and-forget. The app never awaits sync. Any change to the subscriber cannot break the app.

---

## What Is NOT Changed

- All controllers, services, entities, migrations
- The subscriber's `afterInsert` / `afterUpdate` event handlers (same shape)
- The 3-second `setTimeout` debounce pattern
- The locked ID check pattern (loop prevention)
- The `toPlain` serialization method
- The `loadAndEnrich` interface

---

## Section 1: Mapping JSONs

### Files deleted
- `api/mappings/attendee.mapping.json` — Attendees are embedded in Meeting's CalendarEvent envelope; no direct sync
- `api/mappings/decision.mapping.json` — Decision is embedded in Poll's Poll envelope; no direct sync

### `api/mappings/community.mapping.json` (rewrite)

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

`admins` and `members` are computed by subscriber enrichment — not raw DB fields.

### `api/mappings/meeting.mapping.json` (rewrite)

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

`startDateTime`, `endDateTime`, `attendees`, `mandates` are computed by subscriber enrichment.

### `api/mappings/poll.mapping.json` (rewrite)

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

`options`, `mode`, `votingWeight`, and `decision` are computed by subscriber enrichment.

### `api/mappings/vote.mapping.json` (rewrite)

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

`data` is computed by subscriber enrichment: `{ mode: "normal", data: [option_id] }`.

---

## Section 2: Subscriber Changes

### 2a — New `PARENT_TRIGGER_MAP` constant

Added at the top of `subscriber.ts`. When `afterInsert` or `afterUpdate` fires for a child entity in this map, the subscriber re-syncs the **parent** instead of the child itself. The child never calls `handleChange` directly.

```ts
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
```

### 2b — `afterInsert` / `afterUpdate` updated flow

The existing `afterInsert` and `afterUpdate` handlers gain a single branch at the top of the `setTimeout` callback:

```
if tableName is in PARENT_TRIGGER_MAP:
    → load parent entity (Meeting / Poll / Community)
    → enrich parent
    → handleChange(parent, parentTable)
else:
    → existing flow unchanged
```

The locked ID check still runs first in both branches.

### 2c — `getRelations` extended

```ts
private getRelations(tableName: string): string[] {
    switch (tableName) {
        case "communities": return ["members"];
        case "meetings":    return ["community", "attendees", "mandates"];
        case "polls":       return ["meeting", "meeting.community"];
        case "votes":       return ["poll", "poll.meeting", "poll.meeting.community"];
        default:            return [];
    }
}
```

Decision is not in `getRelations` — it is loaded separately in `enrichEntity` via a direct DB query (because Decision has no `@ManyToOne` on Poll).

### 2d — New `enrichEntity` method

Called on the plain object after `loadAndEnrich`. Mutates the plain object by adding computed fields. Returns the enriched object.

#### Community enrichment
```ts
// members: only W3DS-linked members (ename set)
plain.members = entity.members
    .filter((m: any) => m.ename)
    .map((m: any) => ({ ename: m.ename, name: m.name, isAspirant: m.is_aspirant }));

// admins: facilitator as chair
plain.admins = entity.facilitator_ename
    ? [{ ename: entity.facilitator_ename, isChair: true }]
    : [];
```

#### Meeting enrichment
```ts
// Combine separate date + time columns into ISO 8601 datetimes
plain.startDateTime = `${entity.date}T${entity.time}:00`;
plain.endDateTime   = entity.end_time
    ? `${entity.date}T${entity.end_time}:00`
    : plain.startDateTime;

// Attendees: all with their status
plain.attendees = (entity.attendees ?? []).map((a: any) => ({
    name:         a.attendee_name,
    ename:        a.attendee_ename ?? null,
    status:       a.status,
    checkedInAt:  a.checked_in_at ?? null,
    method:       a.method,
    isAspirant:   a.is_aspirant,
}));

// Mandates: all active and revoked
plain.mandates = (entity.mandates ?? []).map((m: any) => ({
    granterName:  m.granter_name,
    granterEname: m.granter_ename ?? null,
    proxyName:    m.proxy_name,
    proxyEname:   m.proxy_ename ?? null,
    scopeNote:    m.scope_note ?? null,
    status:       m.status,
    grantedAt:    m.granted_at ?? null,
    revokedAt:    m.revoked_at ?? null,
}));
```

#### Poll enrichment
```ts
// W3DS Poll requires string[] for options
plain.options      = (entity.vote_options ?? []).map((o: any) => o.label);
plain.mode         = "normal";
plain.votingWeight = "1p1v";

// Embed decision if one exists for this poll
const decision = await AppDataSource.getRepository("Decision").findOne({
    where: { poll_id: entity.id },
});
plain.decision = decision ? {
    result:               decision.result,
    breakdown:            decision.breakdown,
    totalVotes:           decision.total_votes,
    closedAt:             decision.closed_at,
    facilitatorSignature: decision.facilitator_signature ?? null,
} : null;
```

#### Vote enrichment
```ts
// Wrap option_id into W3DS Vote data format
plain.data = { mode: "normal", data: [entity.option_id] };
```

---

## Section 3: Database Cleanup

### Step 1 — Clear stale `id_mappings`

Run once after deployment:
```bash
sqlite3 ~/Projects/ALVer/api/data/mappings.db "DELETE FROM id_mappings;"
```

This removes 39 stale entries that point to envelopes stored with wrong schema IDs. The adapter re-creates mappings on the next sync. Old eVault envelopes become orphaned but do not interfere.

### Step 2 — Trigger re-provisioning

After clearing, restart the API. Then do a no-op save on each community (or wait for a natural write). The subscriber fires, the adapter finds no existing mapping, and provisions a fresh GroupManifest envelope with the correct schema ID.

No DB schema changes, entity changes, or migrations required.

---

## Expected eVault Envelope Shapes

### Community → GroupManifest
```json
{
  "eName": "@de68861c-8ea9-55be-9258-2a8cc3057a60",
  "name": "De Woonwolk",
  "owner": "@facilitator-ename",
  "admins": [{ "ename": "@facilitator-ename", "isChair": true }],
  "members": [
    { "ename": "@abc123", "name": "Jan de Vries",  "isAspirant": false },
    { "ename": "@def456", "name": "Fatima Yilmaz", "isAspirant": true  }
  ],
  "avatar": "...",
  "slug": "de-woonwolk",
  "createdAt": "2025-01-15T10:00:00.000Z"
}
```

### Meeting → CalendarEvent (with embedded attendees + mandates)
```json
{
  "title": "Ledenvergadering Q2",
  "start": "2026-04-16T19:00:00",
  "end":   "2026-04-16T21:00:00",
  "location": "Gemeenschapsruimte",
  "agendaText": "...",
  "status": "archived",
  "facilitatorEname": "@abc123",
  "attendees": [
    { "name": "Jan de Vries",  "ename": "@abc123", "status": "checked_in", "checkedInAt": "2026-04-16T19:03:00", "method": "app",    "isAspirant": false },
    { "name": "Piet Bakker",   "ename": null,       "status": "absent",     "checkedInAt": null,                  "method": "app",    "isAspirant": false }
  ],
  "mandates": [
    { "granterName": "Piet Bakker", "granterEname": null, "proxyName": "Jan de Vries", "proxyEname": "@abc123", "status": "active", "grantedAt": "2026-04-16T18:50:00", "revokedAt": null }
  ],
  "minutesHtml": "...",
  "minutesStatus": "published"
}
```

### Poll → Poll (with embedded decision)
```json
{
  "id": "...",
  "title": "Voorstel: aankoop fietsenstalling",
  "options": ["Voor", "Tegen", "Onthouding"],
  "mode": "normal",
  "votingWeight": "1p1v",
  "status": "closed",
  "deadline": "2026-04-16T20:30:00",
  "meetingId": "...",
  "facilitatorEname": "@abc123",
  "decision": {
    "result": "aangenomen",
    "breakdown": [
      { "option_id": "voor",       "label": "Voor",       "count": 8 },
      { "option_id": "tegen",      "label": "Tegen",      "count": 2 },
      { "option_id": "onthouding", "label": "Onthouding", "count": 1 }
    ],
    "totalVotes": 11,
    "closedAt": "2026-04-16T20:30:00",
    "facilitatorSignature": null
  },
  "createdAt": "2026-04-16T19:15:00.000Z"
}
```

### Vote → Vote
```json
{
  "id": "...",
  "poll": "global-poll-id",
  "voterId": "@abc123",
  "data": { "mode": "normal", "data": ["voor"] },
  "method": "app",
  "onBehalfOfEname": null,
  "onBehalfOfName": null,
  "createdAt": "2026-04-16T19:45:00.000Z"
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `api/mappings/community.mapping.json` | Rewrite |
| `api/mappings/meeting.mapping.json` | Rewrite |
| `api/mappings/poll.mapping.json` | Rewrite |
| `api/mappings/vote.mapping.json` | Rewrite |
| `api/mappings/attendee.mapping.json` | Delete |
| `api/mappings/decision.mapping.json` | Delete |
| `api/src/web3adapter/subscriber.ts` | Extend (additive) |
| `api/data/mappings.db` | Clear `id_mappings` table (manual step) |

No entity files, controllers, services, migrations, or frontend files are touched.
