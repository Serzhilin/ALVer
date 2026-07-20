# Phase 1: Community Linking Design

**Date:** 2026-07-14
**Status:** Approved

## Goal

Replace ALVer's admin-only community creation (which provisioned a new group eVault) with a self-serve community linking flow. Any W3DS-authenticated user who owns or administers a community on the W3DS network can link it to ALVer and becomes its first facilitator.

## Context

ALVer currently creates communities by provisioning new group eVaults via `createGroupEVault`. This is backwards: communities exist in the W3DS ecosystem before ALVer touches them (created via Onboarding, CORE, or other platforms). ALVer should be a meeting/voting app that communities adopt, not a place where communities are born.

Community identity in W3DS = Chat/Group envelope, ontology `550e8400-e29b-41d4-a716-446655440003`. This is the same ontology used by CORE, Onboarding, and eVoting. ALVer's community mapping currently uses a custom schemaId (`a8bfb7cf-3200-4b25-9ea9-ee41100f212e`) — that must change.

Reference implementations: `~/Projects/CORE/api/src/services/CommunityService.ts` (`resolveW3id`, `linkCommunity`) and `~/Projects/Onboarding/app/src/views/PioneerWizard.jsx` (link branch UI).

---

## Architecture

### Ownership verification

Linking requires proof the user administers the community. Backend resolves the community W3ID, reads its Chat envelope, checks:
- `payload.owner === userEname` (owner eName match), OR
- `payload.admins.includes(userMetaEnvelopeId)` (admin list by MetaEnvelope ID)

No Chat envelope → `group_not_found` — user must provision the community in Onboarding or CORE first. Accepting without envelope would let anyone claim any unclaimed W3ID.

### First linker = facilitator

The first person to successfully link a given W3ID becomes `facilitator_ename` in the DB row. If the W3ID is already in DB → `w3id_already_linked` error.

### DB stays simple

No new columns needed. Existing communities (created via old flow) already have `ename` + `evault_uri` — they continue to work. New communities can only enter via linking. No `provisioning_status` column needed — `ename IS NOT NULL` is the invariant.

---

## Backend

### New: `api/src/lib/evault-client.ts`

Port from `~/Projects/Onboarding/api/src/lib/evault-client.ts`. Need two functions:

```typescript
// Fetch all MetaEnvelopes of a given ontology from a vault
export async function findEnvelopesByOntology(
    vaultEname: string,
    ontology: string
): Promise<Array<{ id: string; parsed: Record<string, unknown> | null }>>

// Resolve eName → MetaEnvelope ID of the User profile envelope
export async function getUserMetaEnvelopeId(ename: string): Promise<string | null>
```

Both use `DEVELOPER_API_KEY` + `X-ENAME` header. Resolve eVault URL from registry before each call.

### New: `api/src/lib/w3ds/ontology.ts`

```typescript
export const ONTOLOGIES = {
    Community: '550e8400-e29b-41d4-a716-446655440003',
    User:      '550e8400-e29b-41d4-a716-446655440000',
} as const
```

### New functions in `api/src/services/CommunityService.ts`

```typescript
export type W3idResolution = {
    evault_uri: string;
    w3id: string;
    envelopeId: string;
    envelope: { name: string; logo_url: string | null; description: string | null };
};

// Resolve W3ID + verify caller is owner/admin. Throws:
//   'w3id_not_found'   — registry can't resolve
//   'group_not_found'  — no Chat envelope (must provision in Onboarding/CORE first)
//   'not_admin'        — caller not in owner/admins
export async function resolveW3id(w3id: string, userEname: string): Promise<W3idResolution>

// Link a community W3ID to ALVer. Throws:
//   'w3id_already_linked' — W3ID already in DB
//   'slug_taken'          — slug collision
//   + all errors from resolveW3id
export async function linkCommunity(
    input: { w3id: string; slug: string },
    userEname: string
): Promise<Community>
```

`linkCommunity` creates the DB row with `facilitator_ename = userEname`, name/logo from the envelope, `ename = w3id`, `evault_uri`.

### New API routes (require `requireAuth`, NOT admin-only)

```
GET  /api/communities/resolve?w3id=@<uuid>   → W3idResolution
POST /api/communities/link                   → Community
     body: { w3id: string; slug: string }
```

Error mapping (same as CORE `w3idErrorStatus`):
- `w3id_not_found` → 404
- `group_not_found` → 404
- `not_admin` → 403
- `w3id_already_linked` → 409
- `slug_taken` → 409
- `actor_has_no_ename` → 400

### Remove

- `AdminController.createCommunity` function
- Route `POST /api/admin/communities`
- The `createGroupEVault` import and call

Keep `listCommunities` (GET) and `deleteCommunity` (DELETE) in admin — facilitators and admins still need those.

### Mapping fix

`api/mappings/community.mapping.json`:
```json
{
  "tableName": "communities",
  "schemaId": "550e8400-e29b-41d4-a716-446655440003",
  "ownerEnamePath": "ename",
  "readOnly": true,
  "localToUniversalMap": {
    "name": "name",
    "ename": "eName",
    "facilitator_ename": "owner",
    "logo_url": "avatar",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

`readOnly: true` — ALVer does not own community data, it reads it. Community metadata changes come inbound from AaaS (Phase 2).

### Subscriber

Remove `communities` from `PARENT_TRIGGER_MAP` handling and from outbound sync. Community data is not ALVer's to write. Meetings/polls/votes continue syncing outbound as before.

---

## Frontend

### Remove

Admin create form (in admin panel — wherever `POST /api/admin/communities` is called from).

### Add: linking wizard

Self-serve, 3 steps, accessible from the home screen / community picker for any W3DS-authenticated user. Model after `PioneerWizard.jsx` link branch in Onboarding.

**Step 1 — Enter W3ID:**
- Input for `@<uuid>` (the community's W3DS identity)
- "Resolve" button → `GET /api/communities/resolve?w3id=`
- Inline error display for `w3id_not_found`, `group_not_found`, `not_admin`

**Step 2 — Review + slug:**
- Shows community name and logo from envelope (read-only)
- Slug input (auto-populated from name via slugify, editable)
- "Link community" button → `POST /api/communities/link`
- Inline error for `slug_taken`, `w3id_already_linked`

**Step 3 — Done:**
- Success confirmation
- Redirect into the newly linked community

### Entry point

Add "Link community" action to the community picker (the screen shown after login when user has no community). Also accessible from a "+" button if user already has communities.

---

## What does NOT change

- Auth flow — unchanged
- Meetings, polls, votes, members — unchanged
- Existing communities in DB — they already have `ename` + `evault_uri`, they keep working
- `deleteCommunity` (admin) — stays

---

## Open question (Phase 2 dependency)

After linking, community name/logo in the DB are a snapshot from the time of linking. Phase 2 (AaaS inbound sync) will keep them current. Until Phase 2 ships, the DB cache may drift from the eVault truth — acceptable for Phase 1.
