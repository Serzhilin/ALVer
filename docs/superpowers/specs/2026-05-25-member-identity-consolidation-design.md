# Member Identity Consolidation Design

**Date:** 2026-05-25
**Status:** Approved
**Scope:** Replace dual User/Member identity model with single Member entity as canonical person record

---

## Problem

ALVer has two tables representing the same person:

- `users` — created on W3DS login. Stores ename + eVault-pulled name. No community relation.
- `members` — community-scoped. Created manually by facilitator or auto for facilitators. Has nullable ename.

The join between them is an implicit ename string match — no foreign key. This causes:

- Hand-added members (no ename) invisible to W3DS ecosystem
- eVault name pull overwrites paperwork names (e.g. "Truus Weesjes" → "Truus@deWoonwolk")
- Facilitator may or may not have a member row (bootstrapped lazily in getMe)
- Check-in and voting use fuzzy ILike name fallback — wrong person can match
- No single authoritative identity record

---

## Architecture Target

**eVault = source of truth** for W3DS identity and community membership.
**DB = local operational cache** — fast reads, offline-capable.
**Member = canonical person entity** — one row per person per community, covers both W3DS and manual members.
**Users table = eliminated** after transition.

---

## Data Model

### Member entity (final state)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `community_id` | uuid FK | CASCADE delete |
| `app_first_name` | varchar, nullable | Paperwork name. Shown in app UI everywhere. Never touched by eVault pull. |
| `app_last_name` | varchar, nullable | Same. |
| `first_name` | varchar, nullable | eVault-pulled on login. Shown in Members form (admin only). |
| `last_name` | varchar, nullable | Same. |
| `avatar_url` | varchar, nullable | Pulled from eVault on login. Shown in Members form. |
| `ename` | varchar, nullable | W3DS identity. Nullable — members without W3DS are fully supported. |
| `email` | varchar, nullable | |
| `phone` | varchar, nullable | |
| `is_aspirant` | boolean | |
| `is_facilitator` | boolean | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Removed:** `name` column (was denormalized computed field, caused sync burden).

**Added constraint:** partial unique index `UNIQUE (community_id, ename) WHERE ename IS NOT NULL`.

### Display name

Service function `appDisplayName(member)`:
- Returns `app_first_name + " " + app_last_name` when both set
- Configurable format per context (e.g. `"Truus W."` for compact display)
- No DB column — computed at call site

### User entity

Kept during transition. Dropped in cleanup phase (C2–C3). No changes to schema.

---

## Person lookup — two modes only

| Mode | When | Identifier |
|------|------|-----------|
| W3DS | person has ename | exact `ename` string match |
| Manual | no ename | `member_id` UUID from UI picker |

**ILike / name-based fallback: deleted everywhere.**

Affected services: `AttendeeService.resolveMember()` (deleted), `VoteService` name fallback (deleted), `MandateService` name lookup (deleted).

---

## API changes

### epassportLogin()

1. Verify W3DS signature (unchanged)
2. Find or create User by ename (unchanged during transition)
3. Find Member by ename in any community
4. Fetch eVault profile → update `Member.first_name`, `last_name`, `avatar_url` only
5. Sign JWT `{ userId, ename }` (unchanged during transition)

`app_first_name` / `app_last_name` never written by eVault pull.

### getMe()

- Remove `findById(userId)` call — no User lookup
- Pass Member into `serializeMember()` (replaces `serializeUser()`)
- Return `{ ename, firstName: member.app_first_name, lastName: member.app_last_name, displayName, community, member, isFacilitator }`
- If no Member row (person not yet in any community): return `{ ename }` only
- Community discovery without `communityId` param: `findAsFacilitator(ename)` kept; `findByMemberEname()` global search removed — replaced by `getMyCommunities()` call pattern. Frontend must pass `?communityId=` on all authenticated views except the community picker screen.

### Check-in endpoint

Old body: `{ name: string, ename?: string }` → fuzzy resolve → member

New body (mutually exclusive):
```
{ ename: string }      // W3DS self-check-in
{ member_id: string }  // Manual facilitator check-in
```

`resolveMember()` deleted. Two simple exact lookups, no fallback.

### Vote casting

Voter resolved from checked-in attendee record (linked to member via `member_id`). No `voter_name` lookup. `voter_name` and `attendee_name` kept as **display snapshots** only — populated at event time from `appDisplayName(member)`, never used for lookup.

### Mandate creation

`granter_member_id` and `proxy_member_id` sent from UI picker. Enames derived from those member rows for eVault sync. No name-based lookup.

### Member CRUD

- `app_first_name` + `app_last_name` required (replaces `first_name` + `last_name` as required fields)
- `ename` optional
- `name` field removed from create/update payloads

---

## Frontend changes

### UserContext

No structural change. `getMe()` response shape preserved — same field names, now sourced from Member.

### MembersModal

**Editable section:**
- `app_first_name` (required) — label: "Official first name"
- `app_last_name` (required) — label: "Official last name"
- `ename` (optional) — label: "W3DS identity (eID)"
- `email`, `phone`, `is_aspirant` — unchanged

**Read-only eVault section** (shown only when ename is set):
- Avatar (`avatar_url`) if present
- eName
- eVault name (`first_name + last_name` from eVault pull)

**Save validation:** disabled when `app_first_name` or `app_last_name` empty. Ename no longer required.

### Manual check-in UI

Replace name text input with **member picker**: dropdown of all community members showing `appDisplayName(member)`. Sends `{ member_id }` to API on selection.

### Mandate form

Same change: granter and proxy selected from member picker. Sends `member_id`.

### Display names

All person name rendering uses `appDisplayName(member)`. Single function, one format to change.

---

## eVault sync

### Push direction (DB → eVault) — minimal change

Subscriber unchanged in structure. GroupManifest `members[]` still = Members with ename. Display name in GroupManifest computed from `app_first_name + app_last_name` (was from `name` column).

### Pull direction (eVault → DB) — new

On login, after W3DS verification:
1. Resolve user's eVault URI from registry
2. Query User Profile schema (`550e8400-e29b-41d4-a716-446655440000`) → `first_name`, `last_name`, `avatar_url`
3. Upsert into `Member.first_name`, `last_name`, `avatar_url`
4. Query each community's eVault GroupManifest → validate ename still in `members[]` or `admins[]`
5. If ename missing from GroupManifest but in DB → log warning, do not auto-remove (facilitator decision)

Pull is fire-and-forget: failure does not block login.

---

## Migration sequence

### Phase 1 — DB schema (additive, no logic change)

1. `ALTER TABLE members ADD COLUMN app_first_name, ADD COLUMN app_last_name, ADD COLUMN avatar_url`
2. `UPDATE members SET app_first_name = first_name, app_last_name = last_name`
3. Add partial unique index on `(community_id, ename) WHERE ename IS NOT NULL`
4. Old `first_name`/`last_name` kept (not dropped yet)

### Phase 2 — Services + API

5. Add `appDisplayName()` to MemberService
6. Update `CommunityService`: create/update uses `app_first_name`/`app_last_name`; remove `name` field from all writes
7. Delete `AttendeeService.resolveMember()` — replace with ename/member_id exact lookups
8. Delete name fallbacks from `VoteService` and `MandateService`
9. Update check-in endpoint to accept `{ ename } | { member_id }`
10. Update mandate endpoint to accept `granter_member_id`, `proxy_member_id`
11. Replace `serializeUser()` with `serializeMember()` in AuthController
12. Remove `findById(userId)` call from `getMe()`
13. Update eVault pull: target Member fields, add `avatar_url` fetch

### Phase 3 — Frontend

14. Update MembersModal: add `app_first_name`/`app_last_name` fields, read-only eVault section, remove ename required validation
15. Replace manual check-in name input with member picker
16. Replace mandate name inputs with member picker
17. Update all name display to use `appDisplayName()` response from API

### Phase 4 — Data migration

18. Facilitator assigns ename to remaining Members via Members form (no automated name matching)
19. Verify all Members with ename have correct W3DS identity (smoke test)

### Cleanup phase (separate, after Phase 1–4 stable in production)

**C1** — Drop `name` column from members table

**C2** — Change JWT payload to `{ ename }` only. Update `AuthPayload` type. Existing 30-day tokens expire naturally.

**C3** — Drop `UserService`, `User` entity, `users` table. Rewrite `devLogin`: issue JWT `{ ename: "tester@dewoonwolk" }` directly without any DB write — test member must already exist in DB from seed.

**C4** — Facilitator completes ename assignments for remaining manual-only members.

---

## Invariants preserved

- Manual members (no ename) remain fully supported: check-in by `member_id`, vote cast by facilitator on their behalf
- eVault sync only includes members with ename (unchanged behavior)
- All historical meeting records retain `attendee_name`/`voter_name` as display snapshots
- JWT change (C2) causes no forced logouts — 30-day TTL handles natural rollover
- W3DS auth flow (offer → wallet → login → SSE) unchanged

---

## What is deleted

- `users` table + `User` entity + `UserService`
- `Member.name` column
- `AttendeeService.resolveMember()` (ILike name lookup)
- Name fallbacks in `VoteService`, `MandateService`
- `CommunityService.findByMemberEname()` global search (replaced by community-scoped lookup)
- `userId` from JWT payload
