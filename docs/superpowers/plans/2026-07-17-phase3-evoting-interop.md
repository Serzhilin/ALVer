# Phase 3: eVoting Interoperability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ALVer's broken poll/vote mappings and align the field format with eVoting so that: ALVer polls appear in eVault with compatible `options: string[]`; ALVer votes appear with correct `data: { mode, data }` format; cross-platform vote reception works once the upstream eVoting mapping PR is merged.

**Architecture:** Two DB migrations add `option_labels text[]` to polls and `vote_data jsonb` + `voter_meta_envelope_id varchar` to votes. PollService and VoteService populate these at creation. The two broken mapping JSON files are fixed. InboundSyncService (from Phase 2) is updated to handle Phase 3's new columns when syncing inbound votes/polls.

**Tech Stack:** TypeScript, TypeORM migrations, PostgreSQL, JSON mapping files.

**Dependencies:** Phase 1 complete (getUserMetaEnvelopeId available in evault.ts). Phase 2 complete (InboundSyncService exists).

## Global Constraints

- Vote `data` format: `{ mode: "normal", data: string[] }` — array of selected option labels
- `option_labels` = `vote_options.map(o => o.label)` — derived at creation, never re-derived from eVault
- `voter_meta_envelope_id` and `created_by_meta_envelope_id` resolve fire-and-forget — if lookup fails, skip (don't block the vote/poll save)
- `option_id` column stays intact — ALVer's internal tally logic uses it
- `vote_options` column stays intact — ALVer's internal option ID references use it
- Tally by `voter_ename`, not `voter_meta_envelope_id` — more reliable cross-platform
- Per memory: never push to GitHub; commit locally only

---

## File Map

| File | Action | What changes |
|---|---|---|
| `api/src/database/entities/Poll.ts` | **Modify** | Add `option_labels`, `created_by_meta_envelope_id` columns |
| `api/src/database/entities/Vote.ts` | **Modify** | Add `vote_data`, `voter_meta_envelope_id` columns |
| `api/src/database/migrations/1777400000000-Phase3VotingInterop.ts` | **Create** | ALTER TABLE for polls + votes |
| `api/mappings/poll.mapping.json` | **Modify** | Fix options field, add creatorId, use correct field names |
| `api/mappings/vote.mapping.json` | **Modify** | Fix data field, add userId |
| `api/src/services/PollService.ts` | **Modify** | Populate `option_labels` at creation |
| `api/src/services/VoteService.ts` | **Modify** | Populate `vote_data` + resolve `voter_meta_envelope_id` |
| `api/src/services/InboundSyncService.ts` | **Modify** | Handle Phase 3 columns in poll/vote sync |

---

### Task 1: DB entities + migration

**Files:**
- Modify: `api/src/database/entities/Poll.ts`
- Modify: `api/src/database/entities/Vote.ts`
- Create: `api/src/database/migrations/1777400000000-Phase3VotingInterop.ts`

**Interfaces:**
- Produces: `Poll.option_labels: string[] | null`, `Poll.created_by_meta_envelope_id: string | null`
- Produces: `Vote.vote_data: object | null`, `Vote.voter_meta_envelope_id: string | null`

- [ ] **Step 1: Add columns to `api/src/database/entities/Poll.ts`**

In the Poll entity class, after the `facilitator_ename` column, add:
```typescript
/** Labels-only projection of vote_options for eVault interop (eVoting expects string[]). */
@Column({ type: "text", array: true, nullable: true })
option_labels!: string[] | null;

/** MetaEnvelope ID of the creator's User profile — written to eVault as creatorId. */
@Column({ nullable: true })
created_by_meta_envelope_id!: string | null;
```

- [ ] **Step 2: Add columns to `api/src/database/entities/Vote.ts`**

In the Vote entity class, after the `voter_ename` column, add:
```typescript
/** Vote payload in eVoting-compatible format: { mode: "normal", data: string[] }. */
@Column({ type: "jsonb", nullable: true })
vote_data!: object | null;

/** MetaEnvelope ID of voter's User profile — written to eVault as userId. */
@Column({ nullable: true })
voter_meta_envelope_id!: string | null;
```

- [ ] **Step 3: Create migration `api/src/database/migrations/1777400000000-Phase3VotingInterop.ts`**

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3VotingInterop1777400000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE polls
              ADD COLUMN IF NOT EXISTS option_labels TEXT[],
              ADD COLUMN IF NOT EXISTS created_by_meta_envelope_id VARCHAR;
        `);
        await queryRunner.query(`
            ALTER TABLE votes
              ADD COLUMN IF NOT EXISTS vote_data JSONB,
              ADD COLUMN IF NOT EXISTS voter_meta_envelope_id VARCHAR;
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE polls
              DROP COLUMN IF EXISTS option_labels,
              DROP COLUMN IF EXISTS created_by_meta_envelope_id;
        `);
        await queryRunner.query(`
            ALTER TABLE votes
              DROP COLUMN IF EXISTS vote_data,
              DROP COLUMN IF EXISTS voter_meta_envelope_id;
        `);
    }
}
```

- [ ] **Step 4: Register migration in data-source.ts**

```bash
cat /home/serzhilin/Projects/ALVer/api/src/database/data-source.ts | grep -n "migrations\|Migration"
```

Verify the migration file is auto-discovered (glob pattern) or manually add it to the migrations array. Most configs use a glob like `"src/database/migrations/*.ts"` — if so, no change needed.

- [ ] **Step 5: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Run migration against dev DB**

```bash
cd /home/serzhilin/Projects/ALVer
docker compose up -d
cd api && npx ts-node -r tsconfig-paths/register -e "
  require('reflect-metadata');
  const { AppDataSource } = require('./src/database/data-source');
  AppDataSource.initialize().then(() => AppDataSource.runMigrations()).then(ran => {
    console.log('Ran:', ran.map(m => m.name));
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `Ran: ['Phase3VotingInterop1777400000000']`

Alternatively the migration runs automatically on API startup — just start the API and check the startup log.

- [ ] **Step 7: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/database/entities/Poll.ts \
        api/src/database/entities/Vote.ts \
        api/src/database/migrations/1777400000000-Phase3VotingInterop.ts
git commit -m "feat: add option_labels/vote_data columns for eVoting interop

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix mapping files

**Files:**
- Modify: `api/mappings/poll.mapping.json`
- Modify: `api/mappings/vote.mapping.json`

**Interfaces:**
- Current broken poll mapping: `"options": "options"` (field doesn't exist on Poll entity, format wrong)
- Current broken vote mapping: `"data": "data"` (field doesn't exist on Vote entity)
- Fixed poll: `"option_labels": "options"` + `"created_by_meta_envelope_id": "creatorId"`
- Fixed vote: `"vote_data": "data"` + `"voter_meta_envelope_id": "userId"`

- [ ] **Step 1: Replace `api/mappings/poll.mapping.json`**

```json
{
  "tableName": "polls",
  "schemaId": "660e8400-e29b-41d4-a716-446655440100",
  "ownerEnamePath": "communities(meeting.community.ename)",
  "localToUniversalMap": {
    "id": "id",
    "motion_text": "title",
    "option_labels": "options",
    "meeting": "communities(meeting.community_id),group",
    "created_by_meta_envelope_id": "creatorId",
    "closed_at": "deadline",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

Note: `mode` and `votingWeight` removed — Poll entity has no such columns currently. Add them back only if the columns exist.

- [ ] **Step 2: Replace `api/mappings/vote.mapping.json`**

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

- [ ] **Step 3: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/mappings/poll.mapping.json api/mappings/vote.mapping.json
git commit -m "fix: poll/vote mapping fields — option_labels→options, vote_data→data

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: PollService — populate option_labels at creation

**Files:**
- Modify: `api/src/services/PollService.ts`

**Interfaces:**
- Consumes: `getUserMetaEnvelopeId` from `api/src/lib/evault.ts`; `ONTOLOGIES` (not needed here)
- Existing `PollService.create` takes `{ motion_text, vote_options, facilitator_ename? }`
- After change: also populates `option_labels` and fires async MetaEnvelope ID resolution

- [ ] **Step 1: Add import to PollService.ts**

At the top of `api/src/services/PollService.ts`, add:
```typescript
import { getUserMetaEnvelopeId } from "../lib/evault";
import { logger } from "../lib/logger";
```

- [ ] **Step 2: Update `PollService.create`**

Find the `create` method. After `const saved = await this.pollRepo.save(poll);`, add:

```typescript
// Populate option_labels synchronously (vote_options already known)
const optionLabels = data.vote_options.map((o: VoteOption) => o.label);
await this.pollRepo.update(saved.id, { option_labels: optionLabels });
saved.option_labels = optionLabels;

// Resolve creator MetaEnvelope ID fire-and-forget
const creatorEname = data.facilitator_ename;
if (creatorEname) {
    getUserMetaEnvelopeId(creatorEname)
        .then(metaId => {
            if (metaId) this.pollRepo.update(saved.id, { created_by_meta_envelope_id: metaId });
        })
        .catch(err => logger.warn({ err, pollId: saved.id }, '[Poll] Failed to resolve creator MetaEnvelope ID'));
}
```

Note: `VoteOption` is already imported in PollService from the Poll entity.

- [ ] **Step 3: Ensure PollController passes facilitator_ename**

In `api/src/controllers/PollController.ts`, in the `create` handler, `req.user.ename` is available (the route has `requireFacilitatorOfMeeting`). Update the `svc.create` call:

Find:
```typescript
const poll = await svc.create(req.params.id, { motion_text, vote_options: options });
```

Replace with:
```typescript
const poll = await svc.create(req.params.id, {
    motion_text,
    vote_options: options,
    facilitator_ename: req.user?.ename,
});
```

`req.user` is typed via Express request augmentation. Verify `req.user.ename` is available (it is — auth middleware sets it).

- [ ] **Step 4: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/PollService.ts api/src/controllers/PollController.ts
git commit -m "feat: PollService populates option_labels and resolves creator MetaEnvelope ID

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: VoteService — populate vote_data + voter_meta_envelope_id

**Files:**
- Modify: `api/src/services/VoteService.ts`

**Interfaces:**
- Consumes: `getUserMetaEnvelopeId` from `api/src/lib/evault.ts`
- `validOption` is already resolved in VoteService.cast: `poll.vote_options.find((o) => o.id === data.option_id)`
- After change: `vote_data = { mode: 'normal', data: [validOption.label] }` set before save

- [ ] **Step 1: Add import to VoteService.ts**

At the top of `api/src/services/VoteService.ts`, add:
```typescript
import { getUserMetaEnvelopeId } from "../lib/evault";
import { logger } from "../lib/logger";
```

- [ ] **Step 2: Update `VoteService.cast` — populate vote_data before save**

Find the `vote` creation block:
```typescript
const vote = this.voteRepo.create({
    poll_id: pollId,
    meeting_id: poll.meeting_id,
    voter_name: data.voter_name,
    voter_ename: data.voter_ename,
    voter_member_id: checkedInAttendee?.member_id ?? data.voter_member_id ?? null,
    option_id: data.option_id,
    cast_at: new Date(),
    method: data.method ?? "app",
    on_behalf_of_name: data.on_behalf_of_name,
    on_behalf_of_ename,
});
```

Add `vote_data` to the create call:
```typescript
const vote = this.voteRepo.create({
    poll_id: pollId,
    meeting_id: poll.meeting_id,
    voter_name: data.voter_name,
    voter_ename: data.voter_ename,
    voter_member_id: checkedInAttendee?.member_id ?? data.voter_member_id ?? null,
    option_id: data.option_id,
    vote_data: { mode: 'normal', data: [validOption.label] },
    cast_at: new Date(),
    method: data.method ?? "app",
    on_behalf_of_name: data.on_behalf_of_name,
    on_behalf_of_ename,
});
```

- [ ] **Step 3: Add MetaEnvelope ID resolution after save**

Find:
```typescript
const saved = await this.voteRepo.save(vote);

const count = await this.voteRepo.count({ where: { poll_id: pollId } });
```

Between those two lines, add:
```typescript
// Resolve voter MetaEnvelope ID fire-and-forget
if (data.voter_ename) {
    const ename = data.voter_ename;
    getUserMetaEnvelopeId(ename)
        .then(metaId => {
            if (metaId) this.voteRepo.update(saved.id, { voter_meta_envelope_id: metaId });
        })
        .catch(err => logger.warn({ err, voteId: saved.id }, '[Vote] Failed to resolve voter MetaEnvelope ID'));
}
```

- [ ] **Step 4: Handle the update-existing-vote branch**

In the section that updates an existing vote (when duplicate found):
```typescript
if (existing) {
    existing.option_id = data.option_id;
    existing.voter_ename = data.voter_ename ?? existing.voter_ename;
    existing.on_behalf_of_ename = on_behalf_of_ename ?? existing.on_behalf_of_ename;
    return this.voteRepo.save(existing);
}
```

Update to also refresh `vote_data`:
```typescript
if (existing) {
    existing.option_id = data.option_id;
    existing.vote_data = { mode: 'normal', data: [validOption.label] };
    existing.voter_ename = data.voter_ename ?? existing.voter_ename;
    existing.on_behalf_of_ename = on_behalf_of_ename ?? existing.on_behalf_of_ename;
    return this.voteRepo.save(existing);
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/VoteService.ts
git commit -m "feat: VoteService populates vote_data and resolves voter MetaEnvelope ID

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Update InboundSyncService for Phase 3 columns

**Files:**
- Modify: `api/src/services/InboundSyncService.ts`

**Interfaces:**
- Updates `syncPollFromEvault` to write `option_labels` from inbound `data.options`
- Updates `syncVoteFromEvault` to write `vote_data` from inbound `data.data` + `voter_meta_envelope_id` from `data.userId`; attempts to back-derive `option_id` from label

- [ ] **Step 1: Update `syncPollFromEvault` in InboundSyncService.ts**

Find `syncPollFromEvault`. Add to the patch block:
```typescript
// option_labels: update from inbound options (vote_options left untouched)
if (Array.isArray(data.options)) {
    patch.option_labels = data.options as string[];
}
```

- [ ] **Step 2: Update `syncVoteFromEvault` in InboundSyncService.ts**

Replace the full `syncVoteFromEvault` function with:

```typescript
export async function syncVoteFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, '[InboundSync] Vote not found in mapping table, skipping');
        return;
    }

    const voteRepo = AppDataSource.getRepository(Vote);
    const vote = await voteRepo.findOne({ where: { id: localId } });
    if (!vote) {
        logger.debug({ globalId, localId }, '[InboundSync] Vote row not found, skipping');
        return;
    }

    const patch: Partial<Vote> = {};
    if (data.voterId != null) patch.voter_ename           = data.voterId as string;
    if (data.userId  != null) patch.voter_meta_envelope_id = data.userId as string;
    if (data.data    != null) patch.vote_data              = data.data as object;

    // Attempt to back-derive option_id from vote label for local tally compatibility
    const voteDataObj = data.data as { data?: unknown[] } | null;
    const inboundLabel = Array.isArray(voteDataObj?.data) ? voteDataObj!.data[0] as string : null;
    if (inboundLabel && !vote.option_id) {
        const pollRepo = AppDataSource.getRepository(Poll);
        const poll = await pollRepo.findOne({ where: { id: vote.poll_id } });
        const match = poll?.vote_options?.find(o => o.label === inboundLabel);
        if (match) patch.option_id = match.id;
    }

    if (Object.keys(patch).length > 0) {
        await voteRepo.update(localId, patch);
        logger.info({ globalId, localId }, '[InboundSync] Vote updated (Phase 3 fields)');
    }
}
```

Note: `Poll` must be imported at the top of InboundSyncService.ts — it already is from Task 1 in Phase 2.

- [ ] **Step 3: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/InboundSyncService.ts
git commit -m "feat: InboundSyncService handles Phase 3 vote/poll fields

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start dev environment and verify migration**

```bash
cd /home/serzhilin/Projects/ALVer
docker compose up -d && cd api && npm run dev
```

Check startup log for: `migrations applied: ['Phase3VotingInterop1777400000000']`

- [ ] **Step 2: Verify DB columns exist**

```bash
docker exec $(docker ps -qf "name=alver.*postgres") psql -U alver -d alver \
  -c "\d polls" 2>/dev/null | grep -E "option_labels|created_by_meta"
docker exec $(docker ps -qf "name=alver.*postgres") psql -U alver -d alver \
  -c "\d votes" 2>/dev/null | grep -E "vote_data|voter_meta"
```

Expected: both columns present.

If the container name differs, find it with `docker ps | grep postgres`.

- [ ] **Step 3: Cast a test vote and verify vote_data populated**

Use the app UI: start a meeting as facilitator, create a poll, check in as member, cast a vote. Then verify in DB:

```bash
docker exec $(docker ps -qf "name=alver.*postgres") psql -U alver -d alver \
  -c "SELECT id, option_id, vote_data, voter_ename FROM votes ORDER BY created_at DESC LIMIT 3;"
```

Expected: `vote_data` column shows `{"mode":"normal","data":["Voor"]}` (or whichever label was chosen). `option_id` also set.

- [ ] **Step 4: Create a poll and verify option_labels**

After creating a poll via the UI:
```bash
docker exec $(docker ps -qf "name=alver.*postgres") psql -U alver -d alver \
  -c "SELECT id, motion_text, option_labels FROM polls ORDER BY created_at DESC LIMIT 3;"
```

Expected: `option_labels` shows `{Voor,Tegen,Onthoudend}` (or whatever options were entered).

- [ ] **Step 5: Final commit if fixes needed**

```bash
cd /home/serzhilin/Projects/ALVer
git add -p
git commit -m "fix: smoke test corrections for phase 3

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Note: Upstream eVoting PR (out of scope for this plan)

For ALVer votes to be tallied by eVoting (not just stored in eVault), eVoting's vote mapping needs a one-line fix:

File: `metastate/prototype/platforms/evoting/api/src/web3adapter/mappings/vote.mapping.json`

Change `"userId": "userId"` to `"users(userId),userId"`.

This makes eVoting resolve `userId` (MetaEnvelope ID) → local user UUID via its mapping table, enabling cross-platform vote acceptance. This is a MetaState upstream contribution, not an ALVer change.
