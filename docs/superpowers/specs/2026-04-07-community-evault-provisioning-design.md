# Community eVault Provisioning — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin creates a community, its group eVault is provisioned atomically — the community only exists in ALVer if its eVault was successfully created in W3DS. Deleting a community leaves the eVault intact (data sovereignty).

**Architecture:** Inline synchronous provisioning inside `AdminController.createCommunity`. No new async jobs, no two-phase commits. Frontend blocks with a spinner until the full operation completes.

**Tech Stack:** TypeORM (Community entity), `createGroupEVault` from `web3-adapter`, React admin dashboard.

---

## Scope

Two bugs fixed:

1. **Create**: Community row is saved with `ename = null`, subscriber sync silently fails. Fix: call `createGroupEVault` before saving the DB row; save `ename` + `evault_uri` atomically.
2. **Delete**: eVault is left intact intentionally — data sovereignty principle. No code change needed.

---

## Backend: `AdminController.createCommunity`

Current behaviour: saves community row, returns. `ename` and `evault_uri` remain null.

New behaviour:
1. Validate required fields (`name`, `slug`, `facilitator_ename`).
2. Check slug uniqueness.
3. Call `createGroupEVault(registryUrl, provisionerUrl, { name, description, owner: facilitator_ename, members: [], admins: [] })`.
4. If provisioning fails → return `502 Bad Gateway` with the error message. Nothing is written to the DB.
5. If provisioning succeeds → create and save the community row with `ename = result.w3id`, `evault_uri = result.uri`.
6. Return `201` with the saved community.

**Environment variables required** (already used by `provision-communities.ts`):
- `PUBLIC_REGISTRY_URL`
- `PUBLIC_PROVISIONER_URL`

If either is missing → return `500` with a clear config error before attempting provisioning.

**The `provision-communities.ts` script** remains valid for backfilling legacy communities that have `ename = null`. It is no longer needed for new communities after this fix.

---

## Frontend: `AdminDashboard.jsx`

- The Create button already shows `admin.creating` text while `submitting = true`. No text change needed.
- Add a visible spinner element next to the button text during submission.
- Provisioning can take 2–4 seconds — the existing `submitting` state gates the button correctly already.
- On API error (including 502 provisioning failure), display the error message below the form via the existing `formError` state.
- In the community list, add a small eVault indicator per row:
  - If `community.ename` is set: show a truncated w3id badge (e.g. `w3id: abc123…`) in muted text.
  - If `community.ename` is null: show a `⚠ No eVault` warning badge so the admin knows to run the backfill script.

---

## community.mapping.json

No change needed. `ownerEnamePath: "ename"` is already correct — the subscriber syncs to the community's group eVault. Once `community.ename` is populated at creation time, subsequent `afterUpdate` events (settings changes) will sync correctly.

---

## Delete behaviour

`deleteCommunity` is unchanged. The DB row is removed; the group eVault persists in W3DS. This is intentional: the eVault is the community's sovereign data space, not ALVer's to destroy.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| `PUBLIC_PROVISIONER_URL` not set | `500` — "PROVISIONER_URL not configured" |
| Registry/provisioner unreachable | `502` — error message forwarded to frontend |
| Slug already taken (checked before provisioning) | `409` — no eVault call made |
| eVault created but DB save fails | eVault orphaned in W3DS (acceptable — rare, recoverable via backfill script) |

---

## Out of scope

- Deleting eVaults from W3DS (no API exists in the adapter)
- Updating group eVault membership when members join/leave (separate concern)
- Transferring eVault ownership when facilitator changes
