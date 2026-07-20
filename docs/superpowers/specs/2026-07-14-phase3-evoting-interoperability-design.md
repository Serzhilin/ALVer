# Phase 3: eVoting Interoperability Design

**Date:** 2026-07-14 (revised 2026-07-17)
**Status:** Approved (revision based on deep eVoting inspection)

## Goal

Align ALVer's poll and vote field mappings with eVoting's so that:
1. A poll created in ALVer is fully readable by the eVoting platform (same schemaId, compatible field set)
2. A vote cast in eVoting on an ALVer poll is picked up by ALVer via AaaS (Phase 2) and counted in its tallies
3. A vote cast in ALVer appears in eVault with correct format so eVoting can display it

Schema IDs already match — no ontology change needed. Field alignment + two new DB columns + one upstream eVoting PR (documented below).

## Context

Reference: `~/Projects/metastate/prototype/platforms/evoting/api/src/web3adapter/mappings/`

Phase 2 (AaaS inbound) is a prerequisite: without it, votes cast in eVoting cannot reach ALVer's DB. Phase 3 makes the envelope fields compatible so the inbound data is correctly interpreted.

---

## Existing Mapping Bugs (Priority Fixes)

Two bugs in ALVer's current mappings must be fixed regardless of eVoting interop:

### Bug 1: `api/mappings/vote.mapping.json`

Current: `"data": "data"` — Vote entity has NO `data` column (has `option_id`).
Result: outbound vote envelopes write `undefined` for the vote payload.

### Bug 2: `api/mappings/poll.mapping.json`

Current: `"options": "options"` — Poll entity field is `vote_options` (not `options`).
Result: outbound poll envelopes write `undefined` for the options array.

Both are silent failures — subscriber runs without error but writes empty fields.

---

## Gap Analysis

### Poll

| Universal field | ALVer | eVoting | Action |
|---|---|---|---|
| `id` | ✓ | ✓ | none |
| `title` | ✓ (`motion_text`) | ✓ | none |
| `options` | ✗ mapping broken (see Bug 2) | ✓ (`string[]`) | fix: add `option_labels text[]` column |
| `mode` | ✓ | ✓ | none |
| `votingWeight` | ✓ | ✓ | none |
| `group` | ✓ (via `meeting.community`) | ✓ (via `poll.group`) | none — both resolve to community global ID |
| `deadline` | ✓ (`closed_at`) | ✓ | none |
| `createdAt` / `updatedAt` | ✓ | ✓ | none |
| `creatorId` | ✗ | ✓ | add `created_by_meta_envelope_id` column |
| `visibility` | ✗ | ✓ (optional) | skip |
| `customPrompt` | ✗ | ✓ (optional) | skip |

### Vote

| Universal field | ALVer | eVoting | Action |
|---|---|---|---|
| `id` | ✓ | ✓ | none |
| `pollId` | ✓ (`poll_id`) | ✓ | none |
| `poll` | ✓ | ✓ | none |
| `voterId` | ✓ (`voter_ename`) | ✓ | none |
| `userId` | ✗ (needs `voter_meta_envelope_id`) | ✓ | add column, resolve fire-and-forget |
| `data` | ✗ mapping broken (see Bug 1) | ✓ | fix: add `vote_data jsonb` column |
| `createdAt` | ✓ (`cast_at`) | ✓ | none |

---

## Architecture

### What `userId` means

`userId` in the universal Vote envelope = **MetaEnvelope ID of the voter's User profile envelope** in their eVault. This is the global, cross-platform identity for the user.

To get it: call `getUserMetaEnvelopeId(ename)` (from `api/src/lib/evault-client.ts`, added in Phase 1). It queries the user's eVault for their User profile MetaEnvelope ID. Alternatively, if received via AaaS, the packet ID at `GET /api/packets/{id}` equals this MetaEnvelope ID.

### `option_labels` on polls

ALVer stores options as `vote_options: [{ id: string, label: string }]` (rich format with internal IDs for linking to votes). eVoting stores `options: string[]` (labels only). The universal envelope uses `string[]`.

Add column `option_labels text[]` to polls. Populate at poll creation from `vote_options.map(o => o.label)`. Map `"option_labels"` → `"options"` in poll.mapping.json.

`vote_options` stays intact as ALVer's internal representation — `option_labels` is the eVault projection.

### `vote_data` on votes

ALVer records votes as `option_id: string` (UUID ref to an entry in `poll.vote_options[]`). eVoting records votes as `data: { mode: "normal", data: string[] }` (selected option labels). The universal envelope uses the eVoting format.

Add column `vote_data jsonb` to votes. At vote creation, look up the chosen option's label from `poll.vote_options` where `id = option_id`, then store `{ mode: "normal", data: [label] }` in `vote_data`. Map `"vote_data"` → `"data"` in vote.mapping.json.

`option_id` stays intact for ALVer's internal tally logic.

### `creatorId` on polls

Same as before: add `created_by_meta_envelope_id varchar null`. Resolve fire-and-forget via `getUserMetaEnvelopeId(creator_ename)`.

### `voter_meta_envelope_id` on votes

When ALVer creates a vote, resolve `getUserMetaEnvelopeId(voter_ename)` fire-and-forget and store in `voter_meta_envelope_id`. Map to universal `userId`.

### Upstream eVoting PR required

eVoting's `vote.mapping.json` currently maps `"userId": "userId"` (raw copy — stores eVoting's internal UUID PK directly). This means:
- eVoting writes internal UUID as `userId` in eVault
- When eVoting webhook receives a vote, it does `getUserById(userId)` looking up by internal PK
- ALVer's `userId` = MetaEnvelope ID → `getUserById` returns null → webhook returns 400

**The fix** (upstream PR to `metastate/prototype`):
Change eVoting's `vote.mapping.json` from `"userId": "userId"` to `"users(userId),userId"` (join path).

With the join path, `fromGlobal` translates universal `userId` (MetaEnvelope ID) → mapping table lookup → local eVoting UUID → `getUserById` succeeds.

**Prerequisite:** the voter must have synced to eVoting (their User profile webhook must have fired, creating the mapping entry). For community members using both platforms this is satisfied.

Until the upstream PR lands, ALVer votes appear in eVault with correct format but eVoting's webhook rejects them. eVoting can still display them by reading the eVault directly.

---

## DB Changes

### Migration 1: `polls` table

```sql
ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS option_labels TEXT[],
  ADD COLUMN IF NOT EXISTS created_by_ename VARCHAR,
  ADD COLUMN IF NOT EXISTS created_by_meta_envelope_id VARCHAR;
```

### Migration 2: `votes` table

```sql
ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS vote_data JSONB,
  ADD COLUMN IF NOT EXISTS voter_meta_envelope_id VARCHAR;
```

---

## Mapping Changes

### `api/mappings/poll.mapping.json`

```json
{
  "tableName": "polls",
  "schemaId": "660e8400-e29b-41d4-a716-446655440100",
  "ownerEnamePath": "communities(meeting.community.ename)",
  "localToUniversalMap": {
    "id": "id",
    "motion_text": "title",
    "option_labels": "options",
    "mode": "mode",
    "votingWeight": "votingWeight",
    "meeting": "communities(meeting.community_id),group",
    "created_by_meta_envelope_id": "creatorId",
    "closed_at": "deadline",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

### `api/mappings/vote.mapping.json`

```json
{
  "tableName": "votes",
  "schemaId": "660e8400-e29b-41d4-a716-446655440101",
  "ownerEnamePath": "communities(poll.meeting.community.ename)",
  "localToUniversalMap": {
    "id": "id",
    "poll_id": "pollId",
    "poll": "polls(poll_id),poll",
    "voter_ename": "voterId",
    "voter_meta_envelope_id": "userId",
    "vote_data": "data",
    "cast_at": "createdAt"
  }
}
```

---

## Service Changes

### Poll creation

After building the poll row, before saving:

```typescript
// Derive labels from vote_options (always present at creation)
poll.option_labels = poll.vote_options.map((o: VoteOption) => o.label);
poll.created_by_ename = req.user.ename;
await pollRepo.save(poll);

// Resolve MetaEnvelope ID fire-and-forget
getUserMetaEnvelopeId(req.user.ename)
    .then(metaId => {
        if (metaId) pollRepo.update(poll.id, { created_by_meta_envelope_id: metaId });
    })
    .catch(err => logger.warn('Failed to resolve creator MetaEnvelope ID for poll %s: %o', poll.id, err));
```

### Vote creation

After building the vote row, look up option label from the poll before saving:

```typescript
// Derive vote_data from option_id + poll.vote_options
const chosenOption = poll.vote_options.find((o: VoteOption) => o.id === vote.option_id);
if (chosenOption) {
    vote.vote_data = { mode: 'normal', data: [chosenOption.label] };
}
await voteRepo.save(vote);

// Resolve voter MetaEnvelope ID fire-and-forget
getUserMetaEnvelopeId(vote.voter_ename)
    .then(metaId => {
        if (metaId) voteRepo.update(vote.id, { voter_meta_envelope_id: metaId });
    })
    .catch(err => logger.warn('Failed to resolve voter MetaEnvelope ID for vote %s: %o', vote.id, err));
```

Note: the poll must be loaded with `vote_options` before this step. If the poll is already in memory (common in VoteController), no extra query needed.

### Phase 2 `syncVoteFromEvault` update

When an inbound vote from eVoting arrives via AaaS:

```typescript
// Store raw vote data (eVoting format: { mode, data })
if (data.data) vote.vote_data = data.data as object;
if (data.voterId) vote.voter_ename = data.voterId as string;
if (data.userId) vote.voter_meta_envelope_id = data.userId as string;
// Note: for eVoting-originated votes, voter_meta_envelope_id will be eVoting's
// internal UUID (not a real MetaEnvelope ID) until upstream PR is merged.
// Tally by voter_ename, not voter_meta_envelope_id, for cross-platform reliability.
```

Attempt to back-derive `option_id` from vote_data label (for tally consistency):

```typescript
if (vote.vote_data?.data?.[0]) {
    const label = vote.vote_data.data[0] as string;
    const poll = await pollRepo.findOne({ where: { id: vote.poll_id } });
    const match = poll?.vote_options?.find(o => o.label === label);
    if (match) vote.option_id = match.id;
}
```

If label doesn't match (different platform's options), leave `option_id` null. ALVer tally falls back to counting by `vote_data`.

### Phase 2 `syncPollFromEvault` update

```typescript
if (data.options && Array.isArray(data.options)) {
    poll.option_labels = data.options as string[];
}
if (data.title) poll.motion_text = data.title as string;
if (data.deadline) poll.closed_at = new Date(data.deadline as string);
// vote_options untouched — ALVer's internal IDs must stay intact
```

---

## What does NOT change

- `community.mapping.json` — unchanged from Phase 1 fix
- `meeting.mapping.json` — no eVoting equivalent, unchanged
- `vote_options` column on polls — kept for ALVer's internal vote tracking
- `option_id` column on votes — kept for ALVer's internal tally logic

---

## Upstream eVoting PR (out of ALVer scope)

File: `metastate/prototype/platforms/evoting/api/src/web3adapter/mappings/vote.mapping.json`

Change:
```json
"userId": "userId"
```
To:
```json
"users(userId),userId": "userId"
```

This makes eVoting resolve universal `userId` (MetaEnvelope ID) → local UUID via the mapping table, enabling cross-platform vote acceptance. Without this, eVoting's webhook rejects inbound votes from ALVer with 400.

---

## Interoperability flow (end-to-end)

**ALVer poll → visible in eVoting:**
1. Facilitator creates poll in ALVer → `option_labels`, `created_by_meta_envelope_id` populated
2. Subscriber writes to eVault: `options: ["Voor", "Tegen"]`, `group: <community-global-id>`, `title`, `deadline`, `creatorId`
3. eVoting reads the poll envelope (same schemaId, compatible fields) → can display poll ✓

**ALVer vote → in eVault with correct format:**
1. Member votes in ALVer → `vote_data: { mode: "normal", data: ["Voor"] }`, `voter_meta_envelope_id` resolved
2. Subscriber writes to eVault: `data`, `voterId` (ename), `userId` (MetaEnvelope ID), `pollId`
3. eVoting reads vote from eVault → fields correctly formatted ✓
4. eVoting webhook accepts ALVer vote → **requires upstream PR** (join path fix in eVoting vote mapping)

**eVoting vote → counted in ALVer:**
1. User votes in eVoting → vote written to eVoting's eVault
2. AaaS delivers packet to ALVer webhook (Phase 2)
3. `syncVoteFromEvault`: finds local poll by `pollId` globalId → creates vote with `voter_ename` + `vote_data` + attempts `option_id` back-derivation
4. ALVer tally includes the eVoting vote ✓
