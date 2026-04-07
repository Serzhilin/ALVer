# W3DS eVault Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ALVer's fully-working Postgres-backed app to W3DS eVaults so all meeting data syncs asynchronously to the community's group eVault after every DB write.

**Architecture:** TypeORM EntitySubscriber fires after every insert/update, enriches the entity with needed relations, then dispatches to the Web3Adapter after a 3-second delay. The adapter reads mapping files to route each entity to the correct eVault. Postgres is always source of truth — eVault sync is fire-and-forget.

**Tech Stack:** TypeORM, web3-adapter (local file dep), Node.js ts-node, PostgreSQL (synchronize:true in dev), W3DS registry + provisioner

**Spec:** `docs/superpowers/specs/2026-04-06-w3ds-evault-sync-design.md`
**Knowledge base:** `~/Projects/w3ds-integration-guide.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `api/src/database/entities/Community.ts` | Add `ename` + `evault_uri` nullable columns |
| Modify | `api/package.json` | Add web3-adapter file dep |
| Modify | `api/src/database/data-source.ts` | Register AlverSubscriber |
| Modify | `api/src/web3adapter/subscriber.ts` | Replace stub — full TypeORM subscriber |
| Modify | `.env` | Add PROVISIONER_URL, MAPPING_DB_PATH, schema UUIDs |
| Create | `api/src/scripts/provision-communities.ts` | One-time provisioning script |
| Create | `api/src/web3adapter/mappings/user.mapping.json` | User → personal eVault |
| Create | `api/src/web3adapter/mappings/community.mapping.json` | Community → group eVault |
| Create | `api/src/web3adapter/mappings/meeting.mapping.json` | Meeting → group eVault |
| Create | `api/src/web3adapter/mappings/attendee.mapping.json` | Attendee → group eVault |
| Create | `api/src/web3adapter/mappings/poll.mapping.json` | Poll → group eVault |
| Create | `api/src/web3adapter/mappings/vote.mapping.json` | Vote → group eVault |
| Create | `api/src/web3adapter/mappings/decision.mapping.json` | Decision → group eVault |
| Create | `api/data/` | Directory for SQLite mapping DB |

---

## Task 1: Build web3-adapter and link it

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1.1: Build the web3-adapter**

```bash
cd ~/Projects/metastate/prototype
pnpm --filter web3-adapter build
```

Expected: `dist/index.js` and `dist/index.d.ts` appear in `~/Projects/metastate/prototype/infrastructure/web3-adapter/dist/`.

- [ ] **Step 1.2: Add the dependency to api/package.json**

In `api/package.json`, add to `"dependencies"`:

```json
"web3-adapter": "file:../../metastate/prototype/infrastructure/web3-adapter"
```

The full dependencies section becomes:

```json
"dependencies": {
    "@types/jsonwebtoken": "^9.0.10",
    "axios": "^1.6.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "express-rate-limit": "^8.3.1",
    "jose": "^5.2.0",
    "jsonwebtoken": "^9.0.3",
    "multiformats": "13.3.2",
    "pg": "^8.11.3",
    "reflect-metadata": "^0.2.1",
    "typeorm": "^0.3.24",
    "uuid": "^9.0.1",
    "web3-adapter": "file:../../metastate/prototype/infrastructure/web3-adapter"
}
```

- [ ] **Step 1.3: Install**

```bash
cd ~/Projects/ALVer/api
npm install
```

Expected: `node_modules/web3-adapter/` appears with `dist/index.js` inside.

- [ ] **Step 1.4: Verify the import resolves**

```bash
cd ~/Projects/ALVer/api
npx ts-node -e "import { Web3Adapter } from 'web3-adapter'; console.log('OK', typeof Web3Adapter)"
```

Expected: `OK function`

- [ ] **Step 1.5: Create the mapping DB directory**

```bash
mkdir -p ~/Projects/ALVer/api/data
echo "mapping.db" >> ~/Projects/ALVer/api/.gitignore
```

- [ ] **Step 1.6: Commit**

```bash
cd ~/Projects/ALVer
git add api/package.json api/package-lock.json api/.gitignore
git commit -m "feat: add web3-adapter dependency"
```

---

## Task 2: Add ename + evault_uri to Community entity

**Files:**
- Modify: `api/src/database/entities/Community.ts`

- [ ] **Step 2.1: Add the two new columns**

In `api/src/database/entities/Community.ts`, add after the `locations` column (before the `members` relation):

```typescript
@Column({ nullable: true })
ename!: string;          // W3ID of this community's group eVault

@Column({ nullable: true })
evault_uri!: string;     // provisioned eVault base URL
```

The full file after change (showing context around the insertion):

```typescript
@Column({ type: "jsonb", default: [] })
locations!: object[];

@Column({ nullable: true })
ename!: string;

@Column({ nullable: true })
evault_uri!: string;

@OneToMany(() => Member, (m) => m.community)
members!: Member[];
```

- [ ] **Step 2.2: Restart the API and verify columns were added**

```bash
cd ~/Projects/ALVer
npm run dev
```

Wait for `Server running on port 3001`. TypeORM `synchronize: true` adds the columns automatically in dev.

Verify:

```bash
psql postgresql://alver:alver@localhost:5433/alver -c "\d communities"
```

Expected: `ename` and `evault_uri` columns appear as `character varying`, nullable.

- [ ] **Step 2.3: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/database/entities/Community.ts
git commit -m "feat: add ename and evault_uri to Community entity"
```

---

## Task 3: Add required env vars

**Files:**
- Modify: `.env`

- [ ] **Step 3.1: Generate 5 schema UUIDs for ALVer-specific types**

```bash
node -e "const {v4}=require('uuid'); for(let i=0;i<5;i++) console.log(v4())"
```

Copy the 5 output UUIDs — you'll use them in the next step.

- [ ] **Step 3.2: Add all W3DS sync vars to .env**

Append to `.env` (replace the UUID placeholders with the values you generated):

```env
# W3DS eVault sync
PUBLIC_PROVISIONER_URL=https://provisioner.w3ds.metastate.foundation
ALVER_MAPPING_DB_PATH=/home/serzhilin/Projects/ALVer/api/data/mapping.db

# Schema UUIDs — generated once, never change
SCHEMA_USER=550e8400-e29b-41d4-a716-446655440000
SCHEMA_COMMUNITY=550e8400-e29b-41d4-a716-446655440003
SCHEMA_MEETING=<uuid-1>
SCHEMA_ATTENDEE=<uuid-2>
SCHEMA_POLL=<uuid-3>
SCHEMA_VOTE=<uuid-4>
SCHEMA_DECISION=<uuid-5>
```

- [ ] **Step 3.3: Commit**

```bash
cd ~/Projects/ALVer
git add .env
git commit -m "feat: add W3DS eVault sync env vars"
```

---

## Task 4: Write all 7 mapping files

**Files:**
- Create: `api/src/web3adapter/mappings/user.mapping.json`
- Create: `api/src/web3adapter/mappings/community.mapping.json`
- Create: `api/src/web3adapter/mappings/meeting.mapping.json`
- Create: `api/src/web3adapter/mappings/attendee.mapping.json`
- Create: `api/src/web3adapter/mappings/poll.mapping.json`
- Create: `api/src/web3adapter/mappings/vote.mapping.json`
- Create: `api/src/web3adapter/mappings/decision.mapping.json`

> **Note:** `tableName` must match the string in `@Entity('...')` exactly. Wrong tableName = silent failure.

- [ ] **Step 4.1: Create user.mapping.json**

`api/src/web3adapter/mappings/user.mapping.json`:

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

- [ ] **Step 4.2: Create community.mapping.json**

`api/src/web3adapter/mappings/community.mapping.json`:

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

- [ ] **Step 4.3: Create meeting.mapping.json**

Replace `SCHEMA_MEETING_UUID` with the value from your `.env` `SCHEMA_MEETING` var.

`api/src/web3adapter/mappings/meeting.mapping.json`:

```json
{
  "tableName": "meetings",
  "schemaId": "SCHEMA_MEETING_UUID",
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

- [ ] **Step 4.4: Create attendee.mapping.json**

`api/src/web3adapter/mappings/attendee.mapping.json`:

```json
{
  "tableName": "attendees",
  "schemaId": "SCHEMA_ATTENDEE_UUID",
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

- [ ] **Step 4.5: Create poll.mapping.json**

`api/src/web3adapter/mappings/poll.mapping.json`:

```json
{
  "tableName": "polls",
  "schemaId": "SCHEMA_POLL_UUID",
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

- [ ] **Step 4.6: Create vote.mapping.json**

`api/src/web3adapter/mappings/vote.mapping.json`:

```json
{
  "tableName": "votes",
  "schemaId": "SCHEMA_VOTE_UUID",
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

- [ ] **Step 4.7: Create decision.mapping.json**

`api/src/web3adapter/mappings/decision.mapping.json`:

```json
{
  "tableName": "decisions",
  "schemaId": "SCHEMA_DECISION_UUID",
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

- [ ] **Step 4.8: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/web3adapter/mappings/
git commit -m "feat: add w3ds mapping files for all 7 entities"
```

---

## Task 5: Implement EntitySubscriber

**Files:**
- Modify: `api/src/web3adapter/subscriber.ts`

Replace the entire stub file content with the following. This is adapted from the eVoting subscriber (`platforms/evoting/api/src/web3adapter/watchers/subscriber.ts`) with ALVer-specific entity names and relation chains.

- [ ] **Step 5.1: Replace subscriber.ts**

`api/src/web3adapter/subscriber.ts`:

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
import { Meeting } from "../database/entities/Meeting";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const adapter = new Web3Adapter({
    schemasPath: path.resolve(__dirname, "./mappings/"),
    dbPath: path.resolve(process.env.ALVER_MAPPING_DB_PATH as string),
    registryUrl: process.env.PUBLIC_REGISTRY_URL as string,
    platform: process.env.VITE_PUBLIC_ALVER_BASE_URL as string,
});

@EventSubscriber()
export class AlverSubscriber implements EntitySubscriberInterface {

    async afterInsert(event: InsertEvent<any>) {
        const entityId = event.entity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        setTimeout(async () => {
            try {
                const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                if (!enriched) return;

                const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                await adapter.handleChange({ data: enriched, tableName });
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

        setTimeout(async () => {
            try {
                const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                if (!enriched) return;

                const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                await adapter.handleChange({ data: enriched, tableName });
            } catch (err) {
                console.error(`[W3DS] Sync failed (update) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    // Re-fetch the entity fresh from DB with all relations needed to resolve ownerEnamePath.
    // Must be called inside the 3-sec setTimeout — event-time entity state may be partial.
    // entityTarget is the TypeORM entity class (from event.metadata.target) — required for
    // getRepository; do NOT pass the table name string, it won't work.
    private async loadAndEnrich(id: string, tableName: string, entityTarget: any): Promise<any | null> {
        try {
            const repo = AppDataSource.getRepository(entityTarget);
            const full = await repo.findOne({
                where: { id },
                relations: this.getRelations(tableName),
            });
            if (!full) return null;

            // Decision has no TypeORM @ManyToOne meeting relation — load it manually.
            if (tableName === "decisions") {
                const meeting = await AppDataSource.getRepository(Meeting).findOne({
                    where: { id: full.meeting_id },
                    relations: ["community"],
                });
                if (meeting) full.meeting = meeting;
            }

            return this.toPlain(full);
        } catch (err) {
            console.error(`[W3DS] loadAndEnrich failed for ${tableName}:`, err);
            return null;
        }
    }

    // Relations required to traverse ownerEnamePath for each table.
    private getRelations(tableName: string): string[] {
        switch (tableName) {
            case "meetings":    return ["community"];
            case "attendees":   return ["meeting", "meeting.community"];
            case "polls":       return ["meeting", "meeting.community"];
            case "votes":       return ["poll", "poll.meeting", "poll.meeting.community"];
            case "decisions":   return [];   // meeting loaded manually above
            default:            return [];
        }
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

- [ ] **Step 5.2: Verify TypeScript compiles**

```bash
cd ~/Projects/ALVer/api
npx tsc --noEmit
```

Expected: no errors. If you see `Cannot find module 'web3-adapter'`, run `npm install` first (Task 1).

- [ ] **Step 5.3: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/web3adapter/subscriber.ts
git commit -m "feat: implement W3DS EntitySubscriber for all 7 entities"
```

---

## Task 6: Register subscriber in data-source.ts

**Files:**
- Modify: `api/src/database/data-source.ts`

- [ ] **Step 6.1: Import and register the subscriber**

Add the import at the top of `api/src/database/data-source.ts`:

```typescript
import { AlverSubscriber } from "../web3adapter/subscriber";
```

Add `subscribers` to `dataSourceOptions`:

```typescript
export const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: process.env.ALVER_DATABASE_URL,
    synchronize: process.env.NODE_ENV !== "production" || process.env.DB_SYNCHRONIZE === "true",
    entities: [Meeting, Attendee, Mandate, Poll, Vote, Decision, User, Community, Member],
    subscribers: [AlverSubscriber],
    logging: false,
    extra: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    },
};
```

- [ ] **Step 6.2: Restart and verify subscriber loaded**

```bash
cd ~/Projects/ALVer
npm run dev
```

Watch the console. When the API starts you should see TypeORM initialise. The subscriber won't log anything until a DB write happens — that's correct. No errors = subscriber registered.

- [ ] **Step 6.3: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/database/data-source.ts
git commit -m "feat: register AlverSubscriber in TypeORM data source"
```

---

## Task 7: Provision community eVault

**Files:**
- Create: `api/src/scripts/provision-communities.ts`

This is a one-time script. After running it, each Community row gains an `ename` and `evault_uri`. The subscriber will then route that community's data to its group eVault.

- [ ] **Step 7.1: Create the provisioning script**

`api/src/scripts/provision-communities.ts`:

```typescript
import "reflect-metadata";
import path from "path";
import { config } from "dotenv";
import { createGroupEVault } from "web3-adapter";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";

config({ path: path.resolve(__dirname, "../../../.env") });

async function provisionCommunities() {
    console.log("Provisioning community eVaults...");

    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const provisionerUrl = process.env.PUBLIC_PROVISIONER_URL;

    if (!registryUrl || !provisionerUrl) {
        throw new Error("PUBLIC_REGISTRY_URL and PUBLIC_PROVISIONER_URL must be set in .env");
    }

    const repo = AppDataSource.getRepository(Community);
    const communities = await repo.find();
    const unprovisionedCount = communities.filter(c => !c.ename).length;

    console.log(`Found ${communities.length} communities, ${unprovisionedCount} need provisioning.`);

    for (const community of communities) {
        if (community.ename) {
            console.log(`  [skip] ${community.name} — already has ename: ${community.ename}`);
            continue;
        }

        console.log(`  [provision] ${community.name}...`);
        try {
            const result = await createGroupEVault(registryUrl, provisionerUrl, {
                name: community.name,
                description: `${community.name} — cooperative meeting community`,
                members: [],
                admins: [],
                owner: community.facilitator_ename ?? "",
            });

            community.ename = result.w3id;
            community.evault_uri = result.uri;
            await repo.save(community);

            console.log(`  [ok] ${community.name} → ${result.w3id}`);
        } catch (err) {
            console.error(`  [error] ${community.name}:`, err);
        }
    }

    await AppDataSource.destroy();
    console.log("Done.");
}

provisionCommunities().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
```

- [ ] **Step 7.2: Add a script shortcut to api/package.json**

In `api/package.json` scripts:

```json
"provision": "npx ts-node src/scripts/provision-communities.ts"
```

- [ ] **Step 7.3: Run the provisioning script**

Make sure the dev server is stopped (it holds a DB connection). Then:

```bash
cd ~/Projects/ALVer/api
npm run provision
```

Expected output:

```
Provisioning community eVaults...
Found 1 communities, 1 need provisioning.
  [provision] De Woonwolk...
  [ok] De Woonwolk → @<uuid>.w3id
Done.
```

- [ ] **Step 7.4: Verify ename populated in DB**

```bash
psql postgresql://alver:alver@localhost:5433/alver -c "SELECT name, ename, evault_uri FROM communities;"
```

Expected: `ename` and `evault_uri` are non-null for every community row.

- [ ] **Step 7.5: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/scripts/provision-communities.ts api/package.json
git commit -m "feat: add community eVault provisioning script"
```

---

## Task 8: Smoke test — verify eVault sync works

No code changes. This task verifies the full pipeline end-to-end.

- [ ] **Step 8.1: Start the dev server**

```bash
cd ~/Projects/ALVer
npm run dev
```

- [ ] **Step 8.2: Trigger a sync by creating/updating a meeting**

Either use the UI to open a meeting, or call the API directly:

```bash
# Check-in to an existing meeting (triggers Attendee insert)
# Or create a new meeting via the Facilitate flow in the UI
```

Watch the API console. After 3 seconds you should see either a successful sync log or a `[W3DS] Sync failed` error with details.

- [ ] **Step 8.3: Confirm data appeared in the community eVault**

Get the community's eVault URI from the DB:

```bash
psql postgresql://alver:alver@localhost:5433/alver -c "SELECT name, ename, evault_uri FROM communities LIMIT 1;"
```

Then query the eVault's GraphQL endpoint directly:

```bash
curl -X POST "<evault_uri>/graphql" \
  -H "Content-Type: application/json" \
  -H "X-ENAME: <community_ename>" \
  -d '{"query":"{ metaEnvelopes { id ontology parsed } }"}'
```

Expected: response contains MetaEnvelopes with your meeting/attendee/poll/vote data.

- [ ] **Step 8.4: Cast a vote and verify it synced**

Use the full meeting flow in the UI:
1. Open a meeting as facilitator
2. Check in as a user (eID login)
3. Create and open a poll
4. Cast a vote
5. Wait 3 seconds
6. Re-run the GraphQL query — a new MetaEnvelope with `ontology: SCHEMA_VOTE_UUID` should appear

- [ ] **Step 8.5: Commit a test note**

```bash
cd ~/Projects/ALVer
git add -A
git commit -m "feat: W3DS eVault sync — smoke tested and working"
```

---

## Notes for future W3DS apps

- The `w3ds-integration-guide.md` at `~/Projects/w3ds-integration-guide.md` has the full reusable reference.
- The `ownerEnamePath` syntax requires `groups(path.to.ename)` for any nested traversal — simple dotted paths without the wrapper do NOT work (flat key lookup only).
- Always load relations inside the subscriber's 3-second timeout, never at event time.
- When an entity has a foreign key (`meeting_id`) but no TypeORM relation object, load the related entity manually as shown in `enrichEntity` for `decisions`.
- If a community has `ename = null`, all its meeting/vote/decision data is silently skipped. Run the provisioning script before expecting sync to work.
