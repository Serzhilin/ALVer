# ALVer Member ↔ eVault Group Sync — Design

**Date:** 2026-04-18

## Problem

ALVer members and the community's group eVault GroupManifest member list are out of sync in two cases:

1. **Member deletion**: `deleteMember` uses TypeORM's `delete(id)` which bypasses subscriber events entirely. When a member is removed from ALVer, the GroupManifest in the group eVault is never updated — the removed member stays listed indefinitely.

2. **Provisioning with existing members**: `provision-communities.ts` creates the group eVault with `members: []`. If the community already has members with eNames, the GroupManifest starts empty and only gets populated the next time someone modifies a member — which may never happen for long-standing members.

Insert and update are already handled correctly: `PARENT_TRIGGER_MAP` routes member changes through `syncParent`, which reloads the community and updates the GroupManifest via `adapter.handleChange`.

## What "group sync" means

The community's group eVault holds a single GroupManifest metaenvelope (schema `a8bfb7cf-3200-4b25-9ea9-ee41100f212e`). Its `members` field is an array of `{ ename, name, isAspirant }` objects. Syncing a member means updating this metaenvelope to reflect the current ALVer member list. No personal eVaults are touched — we have no write access to them and they're owned by the individuals.

## Fix

### 1. Fix `deleteMember` in `CommunityService`

Change from `delete(id)` to `findOne` + `remove(entity)` so TypeORM fires subscriber events:

```ts
async deleteMember(id: string): Promise<void> {
    const member = await this.memberRepo.findOneBy({ id });
    if (member) {
        await this.memberRepo.remove(member);
    }
}
```

### 2. Add `afterRemove` to `AlverSubscriber`

Mirrors `afterInsert`/`afterUpdate` exactly — checks `PARENT_TRIGGER_MAP` and calls `syncParent`:

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

The `event.entity` still contains `community_id` at the point of removal, so `syncParent` can load the community (minus the deleted member) and push the updated GroupManifest.

### 3. Backfill existing members in `provision-communities.ts`

After the group eVault is created, immediately trigger a community sync so existing members with eNames appear in the GroupManifest:

```ts
const result = await createGroupEVault(...);
community.ename = result.w3id;
community.evault_uri = result.uri;
await repo.save(community);

// Reload with members and sync
const withMembers = await repo.findOne({ where: { id: community.id }, relations: ["members"] });
if (withMembers) {
    const plain = toPlain(withMembers);
    plain.admins = withMembers.facilitator_ename
        ? [{ ename: withMembers.facilitator_ename, isChair: true }]
        : [];
    plain.members = (withMembers.members ?? [])
        .filter((m) => m.ename)
        .map((m) => ({ ename: m.ename, name: m.name, isAspirant: m.is_aspirant ?? false }));
    await adapter.handleChange({ data: plain, tableName: "communities" });
}
```

## Edge cases

| Case | Behaviour |
|------|-----------|
| Member deleted without ename | `syncParent` fires, GroupManifest updated (they were filtered out before anyway — no visible change) |
| Member added without ename | Already handled by existing `afterInsert` (filtered in `enrichEntity`) |
| Member's ename added later via update | `afterUpdate` fires → community re-synced → member appears in GroupManifest |
| Community not yet provisioned (no `ename`) | `handleChange` returns early (no `ownerEvault`) — safe no-op |
| Facilitator deleted as a member row | `community.facilitator_ename` field unchanged — still listed as admin in GroupManifest |

## Out of scope

- Incoming webhook sync (eVault → ALVer): `WebhookController` remains a stub; no external system writes to group eVaults directly.
- Deleting personal eVaults: not possible and not desired.
- Re-provisioning already-provisioned communities: script skips communities with existing `ename`.
