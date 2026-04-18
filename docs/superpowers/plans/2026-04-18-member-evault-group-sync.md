# Member eVault Group Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the community's group eVault GroupManifest in sync when ALVer members are added, updated, or deleted, and backfill existing members when a community is first provisioned.

**Architecture:** Two gaps are closed: (1) `deleteMember` currently uses TypeORM's `delete(id)` which bypasses all subscriber events — switching to `findOne` + `remove(entity)` makes TypeORM fire `afterRemove`; (2) a new `afterRemove` handler in `AlverSubscriber` calls the existing `syncParent` to rebuild and push the updated GroupManifest. Additionally, `provision-communities.ts` is updated to register the new manifest ID in the adapter's MappingDatabase and immediately push the full member list after provisioning.

**Tech Stack:** Node.js / TypeScript, TypeORM 0.3.x, Web3Adapter (local vendor package), Express, PostgreSQL.

---

## Files

- Modify: `api/src/services/CommunityService.ts:192-194` — `deleteMember` method
- Modify: `api/src/web3adapter/subscriber.ts:1-8,37` — add `RemoveEvent` import + `afterRemove` method
- Modify: `api/src/scripts/provision-communities.ts` — import adapter, register mapping, backfill members

---

### Task 1: Fix deleteMember to fire subscriber events

TypeORM's `delete(id)` bypasses all entity subscribers. Switching to `remove(entity)` makes `afterRemove` fire.

**Files:**
- Modify: `api/src/services/CommunityService.ts:192-194`

- [ ] **Step 1: Open the file and confirm the current implementation**

```bash
grep -n "deleteMember" api/src/services/CommunityService.ts
```

Expected output:
```
192:    async deleteMember(id: string): Promise<void> {
193:        await this.memberRepo.delete(id);
194:    }
```

- [ ] **Step 2: Replace `delete(id)` with `findOneBy` + `remove`**

In `api/src/services/CommunityService.ts`, replace lines 192–194:

```ts
    async deleteMember(id: string): Promise<void> {
        const member = await this.memberRepo.findOneBy({ id });
        if (member) {
            await this.memberRepo.remove(member);
        }
    }
```

- [ ] **Step 3: Verify the change compiles**

```bash
cd api && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add api/src/services/CommunityService.ts
git commit -m "fix: deleteMember uses remove(entity) so TypeORM subscriber fires"
```

---

### Task 2: Add afterRemove handler to AlverSubscriber

`afterRemove` mirrors `afterInsert`/`afterUpdate`: checks `PARENT_TRIGGER_MAP` for the deleted entity's table, then calls `syncParent` which reloads the community (minus the deleted member) and pushes the updated GroupManifest.

**Files:**
- Modify: `api/src/web3adapter/subscriber.ts`

- [ ] **Step 1: Add `RemoveEvent` to the typeorm import**

In `api/src/web3adapter/subscriber.ts`, change the import block at lines 1–7 from:

```ts
import {
    EventSubscriber,
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
} from "typeorm";
```

to:

```ts
import {
    EventSubscriber,
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
    RemoveEvent,
} from "typeorm";
```

- [ ] **Step 2: Add the `afterRemove` method to `AlverSubscriber`**

In `api/src/web3adapter/subscriber.ts`, add `afterRemove` after the closing brace of `afterUpdate` (before the `syncParent` private method). The class currently has `afterInsert` (line 39) and `afterUpdate` (line 66). Insert this block between `afterUpdate`'s closing brace and `syncParent`:

```ts
    async afterRemove(event: RemoveEvent<any>) {
        const tableName = event.metadata.tableName;
        const parentTrigger = PARENT_TRIGGER_MAP[tableName];
        if (!parentTrigger || !event.entity) return;

        setTimeout(async () => {
            try {
                await this.syncParent(event.entity, parentTrigger);
            } catch (err) {
                console.error(`[W3DS] Sync failed (remove) for ${tableName}:`, err);
            }
        }, 3_000);
    }
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd api && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add api/src/web3adapter/subscriber.ts
git commit -m "feat: afterRemove syncs community GroupManifest when member deleted"
```

---

### Task 3: Backfill existing members on provisioning

After `createGroupEVault` creates the initial GroupManifest with `members: []`, we register the manifest ID in the adapter's MappingDatabase (so future `handleChange` calls update rather than create), then push the full enriched member list.

**Files:**
- Modify: `api/src/scripts/provision-communities.ts`

- [ ] **Step 1: Add import for `adapter` at the top of the file**

In `api/src/scripts/provision-communities.ts`, add the adapter import after the existing imports:

```ts
import "reflect-metadata";
import path from "path";
import { config } from "dotenv";
import { createGroupEVault } from "web3-adapter";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
import { adapter } from "../web3adapter/subscriber";
```

- [ ] **Step 2: Ensure adapter mappings are loaded before provisioning loop**

After `await AppDataSource.initialize();`, add:

```ts
    // Ensure adapter's JSON mapping files are loaded before we call handleChange
    await adapter.readPaths();
```

- [ ] **Step 3: Register manifest ID and backfill members after provisioning**

Replace the block inside the `try` that ends with `console.log(\`  [ok] ...\`)`:

```ts
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

            // Register the manifest ID so future handleChange calls update rather
            // than create a second envelope.
            await adapter.mappingDb.storeMapping({
                localId: community.id,
                globalId: result.manifestId,
            });

            // Backfill existing members with eNames into the GroupManifest.
            const withMembers = await repo.findOne({
                where: { id: community.id },
                relations: ["members"],
            });
            if (withMembers) {
                const enriched: Record<string, any> = {
                    id: withMembers.id,
                    name: withMembers.name,
                    slug: withMembers.slug ?? null,
                    ename: withMembers.ename,
                    facilitator_ename: withMembers.facilitator_ename ?? null,
                    logo_url: withMembers.logo_url ?? null,
                    created_at: withMembers.created_at instanceof Date
                        ? withMembers.created_at.toISOString()
                        : withMembers.created_at,
                    updated_at: withMembers.updated_at instanceof Date
                        ? withMembers.updated_at.toISOString()
                        : withMembers.updated_at,
                    admins: withMembers.facilitator_ename
                        ? [{ ename: withMembers.facilitator_ename, isChair: true }]
                        : [],
                    members: (withMembers.members ?? [])
                        .filter((m) => m.ename)
                        .map((m) => ({
                            ename: m.ename,
                            name: m.name,
                            isAspirant: m.is_aspirant ?? false,
                        })),
                };
                await adapter.handleChange({ data: enriched, tableName: "communities" });
                const synced = enriched.members.length;
                console.log(`  [synced] ${synced} member(s) with eName to GroupManifest`);
            }

            console.log(`  [ok] ${community.name} → ${result.w3id}`);
```

- [ ] **Step 4: Verify the file compiles**

```bash
cd api && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add api/src/scripts/provision-communities.ts
git commit -m "feat: provision-communities backfills existing members into GroupManifest"
```

---

### Task 4: Manual smoke-test

No automated test framework is installed. Verify the three flows manually.

**Files:** none — verification only.

- [ ] **Step 1: Verify delete sync — add a member with an eName, then delete them**

Start the API if not running:
```bash
cd api && pnpm dev > /tmp/alver-api.log 2>&1 &
```

Add a member via the ALVer UI (or via curl to the facilitator-authenticated member endpoint), giving them an eName. Wait 5 seconds for the insert sync.

Then delete that member via the UI (or via curl). Wait 5 seconds.

Check the ALVer API log for the remove sync:
```bash
grep -i "sync\|remove\|W3DS" /tmp/alver-api.log | tail -20
```

Expected: lines like `[W3DS] Sync ...` appearing after the delete, no errors.

- [ ] **Step 2: Verify the GroupManifest was updated in the group eVault**

Get the community's group eVault ename from the DB:
```bash
docker exec metastate-postgres psql -U postgres -d alver \
  -c "SELECT name, ename FROM communities LIMIT 3;"
```

Fetch the GroupManifest via the eVault GraphQL (replace `@GROUP-ENAME` with the community ename):
```bash
EVAULT_URI=$(curl -s "http://localhost:4321/resolve?w3id=@GROUP-ENAME" | python3 -c "import sys,json; print(json.load(sys.stdin)['uri'])")
curl -s "${EVAULT_URI}/graphql" \
  -H "Content-Type: application/json" \
  -H "X-ENAME: @GROUP-ENAME" \
  -d '{"query":"{ getMetaEnvelopesByOntology(ontology: \"a8bfb7cf-3200-4b25-9ea9-ee41100f212e\") { id parsed } }"}' \
  | python3 -m json.tool
```

Expected: `parsed.members` array does NOT contain the deleted member's eName.

- [ ] **Step 3: Verify provisioning backfill**

If there are already-provisioned communities, you can test the backfill by temporarily clearing the mapping DB and re-running provisioning — but that is destructive. Instead, verify the logic by re-provisioning a new (empty) community:

```bash
cd api && pnpm provision
```

Expected log output includes:
```
[synced] N member(s) with eName to GroupManifest
[ok] <community name> → @<w3id>
```

If `N = 0`, add a member with an eName first, then provision another community.

- [ ] **Step 4: Check for duplicate GroupManifest envelopes**

After provisioning, verify only one GroupManifest envelope exists in the group eVault:
```bash
curl -s "${EVAULT_URI}/graphql" \
  -H "Content-Type: application/json" \
  -H "X-ENAME: @GROUP-ENAME" \
  -d '{"query":"{ getMetaEnvelopesByOntology(ontology: \"a8bfb7cf-3200-4b25-9ea9-ee41100f212e\") { id } }"}' \
  | python3 -m json.tool
```

Expected: exactly one entry in the result array.
