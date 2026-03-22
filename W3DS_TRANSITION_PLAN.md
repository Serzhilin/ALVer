# ALVer → W3DS Transition Plan

**Written:** March 2026
**Reference:** `W3DS_transition.md` (timebanking/Prikbord), `evoting_platform_interface.md`, eVoting source
**Intended audience:** Claude Code agents and developers implementing this transition

---

## Current State

ALVer is a working local app:
- Express + TypeORM + PostgreSQL backend
- React + Vite frontend
- Real-time via SSE
- Name-based identity: `attendee_name`, `voter_name` — no auth, no eID
- W3DS stub hooks already in place in every service method
- `attendee_ename`, `voter_ename`, `signature`, `facilitator_signature` fields exist on entities — ready for real data

---

## What we are NOT changing

- The meeting flow (check-in → session → polls → close → archive)
- The SSE real-time sync architecture
- The database schema — only additive changes
- The frontend views — only additions to auth screens and vote signing

---

## Transition Phases

---

### Phase 1 — eID Authentication + User Identity

**Goal:** Replace "type your name" with "log in with eID wallet." On first login, create a user record. On subsequent logins, find it.

**Why first:** All later phases depend on knowing who is logged in and having their `ename`.

#### 1.1 — New `User` entity

Add `User` to the DB as the platform-level identity. Attendees remain meeting-specific instances of a user.

```
User
  id           uuid PK
  ename        varchar  UNIQUE  ← W3ID from eID wallet
  first_name   varchar  nullable
  last_name    varchar  nullable
  display_name varchar  nullable  ← computed: "Sara V."
  created_at   timestamp
```

`Attendee.attendee_ename` already exists — link it to `User.ename` on check-in.

#### 1.2 — Auth flow (copy from W3DS_transition.md Part 1 exactly)

Three endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/offer` | Returns `{ offer: "w3ds://...", sessionId }` |
| POST | `/api/auth/login` | Called by wallet — verifies signature, findOrCreate user, issues JWT |
| GET | `/api/auth/sessions/:id` | SSE — desktop waits here until phone approves |

`findOrCreateByEname(ename)`:
- If user exists → return existing
- If not → `repo.create({ ename })`, then `fetchEVaultProfile` to populate `first_name`/`last_name`

JWT payload: `{ userId, ename }`. Stored in `localStorage` as `alver_token`.

#### 1.3 — Auth middleware

All meeting routes get `requireAuth` middleware → sets `req.user`. Facilitator routes additionally get `requireFacilitator` (Phase 2).

#### 1.4 — Frontend LoginScreen

Placed before any meeting view. Standard W3DS pattern (from W3DS_transition.md Step 8):
- **Desktop:** render offer as QR, open SSE stream, wait for JWT
- **Mobile:** `<a href={offer}>` deep link button, detect wallet redirect params on mount, exchange for JWT
- After login: `UserContext` holds `{ id, ename, displayName }` — replaces the current `alver_my_name` localStorage hack

Display name format: `${firstName} ${lastName[0]}.` → "Sara V."

#### 1.5 — Check-in wired to auth

When an authenticated user opens `/attend`, they are auto-checked-in using their real `ename` — no name input needed. `attendee_ename` is populated from `req.user.ename`.

The manual "type your name" check-in in Facilitate stays for people without the app.

#### 1.6 — env vars needed

```env
PUBLIC_REGISTRY_URL=https://registry.w3ds.metastate.foundation
PUBLIC_ALVER_BASE_URL=http://<your-LAN-IP>:3001   # wallet must reach this
JWT_SECRET=<random>
```

---

### Phase 2 — Group Membership (De Woonwolk)

**Goal:** Everyone who logs in via eID is treated as a member of De Woonwolk. The facilitator is a member with the `admin` role. This is hardcoded for now; Phase 5 replaces it with the real group eVault.

**Why second:** Auth must exist before membership can be evaluated.

#### 2.1 — New `Group` and `GroupMember` entities

```
Group
  id        uuid PK
  name      varchar        ← "De Woonwolk"
  ename     varchar        ← W3ID of the group eVault (null until Phase 5)
  evault_uri varchar       ← URI of group eVault (null until Phase 5)

GroupMember
  id        uuid PK
  group_id  → Group
  user_id   → User
  role      enum: member | admin
  joined_at timestamp
```

Seed creates one Group row for De Woonwolk.

#### 2.2 — Auto-membership on login

In `epassportLogin`, after `findOrCreateByEname`:

```typescript
const group = await groupRepo.findOne({ where: { name: 'De Woonwolk' } })
const existing = await memberRepo.findOne({ where: { groupId: group.id, userId: user.id } })
if (!existing) {
  await memberRepo.save(memberRepo.create({ groupId: group.id, userId: user.id, role: 'member' }))
}
```

First user to log in after seeding becomes admin (or assign admin explicitly via seed).

#### 2.3 — Facilitator authorization

`requireFacilitator` middleware: checks `GroupMember.role === 'admin'` for the user and the meeting's group.

For now, the seed script sets the demo facilitator as admin. In the UI, the facilitator login will naturally work for whoever has that role.

#### 2.4 — Meeting linked to Group

Add `group_id → Group` FK to `Meeting`. Seed populates it. Meeting-level access checks use this.

---

### Phase 3 — Platform eVault + Outgoing Sync

**Goal:** Provision ALVer's own W3DS identity and start syncing data to users' personal eVaults. Follows W3DS_transition.md Parts 2 & 3 exactly.

**Why third:** Need authenticated users with real `ename` before any eVault write makes sense.

#### 3.1 — Provision ALVer platform eVault (one-time)

Copy `provision-platform.ts` from Prikbord, change `displayName` to "ALVer" and `description`. Run once:

```bash
npm run provision   # new script in api/package.json
```

Adds to `.env`:
```env
ALVER_COMMUNITY_ENAME=@...
ALVER_EVAULT_URI=http://...
ALVER_MAPPING_DB_PATH=/absolute/path/to/api/data
```

#### 3.2 — Build and link web3-adapter

```bash
cd ~/Projects/metastate/prototype
pnpm --filter web3-adapter build
```

`api/package.json`:
```json
"web3-adapter": "file:../../../metastate/prototype/infrastructure/web3-adapter"
```

#### 3.3 — Mapping files

Three mappings for Phase 3. Place in `api/src/web3adapter/mappings/`:

**`user.mapping.json`**
```json
{
  "tableName": "users",
  "schemaId": "550e8400-e29b-41d4-a716-446655440000",
  "ownerEnamePath": "ename",
  "localToUniversalMap": {
    "first_name": "firstName",
    "last_name": "lastName",
    "display_name": "displayName"
  },
  "readOnly": false
}
```

**`attendee.mapping.json`** — attendance at a specific meeting
```json
{
  "tableName": "attendees",
  "schemaId": "alver-attendance-uuid-tbd",
  "ownerEnamePath": "attendee_ename",
  "localToUniversalMap": {
    "attendee_name": "memberName",
    "meeting_id": "meetingId",
    "checked_in_at": "checkedInAt",
    "method": "checkInMethod"
  },
  "readOnly": false
}
```

**`votes.mapping.json`** — individual votes (see Phase 4 for signed version)
```json
{
  "tableName": "votes",
  "schemaId": "alver-vote-uuid-tbd",
  "ownerEnamePath": "voter_ename",
  "localToUniversalMap": {
    "poll_id": "pollId",
    "option_id": "optionId",
    "cast_at": "castAt",
    "signature": "signature"
  },
  "readOnly": false
}
```

> **Schema IDs:** Generate new UUIDs for ALVer-specific types. Reuse standard ones (user profile: `550e8400-e29b-41d4-a716-446655440000`) wherever applicable. Document chosen UUIDs in `.env` and here.

#### 3.4 — Activate the TypeORM subscriber

The stub at `api/src/web3adapter/subscriber.ts` already exists. Replace stub comments with the full pattern from W3DS_transition.md Part 3 Step 4. Key rule: **load entity INSIDE the 3-second setTimeout, never before.**

Register in `data-source.ts`: `subscribers: [AppSubscriber]`

Users without `ename` (manual check-ins) → adapter silently skips. Correct behavior.

---

### Phase 4 — Signed Votes on Personal eVaults

**Goal:** Votes are signed by the voter's eID wallet and stored in their personal eVault. This is the core W3DS feature of ALVer. Follow eVoting patterns as closely as possible.

**Why fourth:** Requires auth (Phase 1) and outgoing sync (Phase 3).

**Reference:** `evoting` platform — private vote mode with eID wallet signing.

#### 4.1 — Vote signing flow

eVoting's model for signed votes:

1. Voter opens the poll on their device
2. Server creates a **signing session**: challenge = `pollId + optionId + voterEname + timestamp`
3. Frontend calls `POST /api/polls/:pollId/sign-challenge` → returns `{ sessionId, offer: "w3ds://sign?..." }`
4. **Desktop:** QR code to scan with eID wallet, 15-minute window
5. **Mobile:** deep link button → wallet → signs → redirects back
6. Wallet POSTs signed challenge to `POST /api/auth/vote-signature`
7. Server verifies signature via `verifySignature()`
8. Server casts the vote with `signature` field populated
9. SSE notifies all watchers

New endpoints:
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/polls/:pollId/sign-challenge` | Create signing session for a vote |
| POST | `/api/auth/vote-signature` | Wallet callback — verify + cast vote |

#### 4.2 — Vote entity update

`Vote.signature` field already exists. Populate it from the verified wallet signature. `Vote.voter_ename` already exists — populated from `req.user.ename`.

#### 4.3 — eVault sync of signed vote

The `votes.mapping.json` from Phase 3 already includes `signature` in the map. Once signed, the vote syncs to the voter's personal eVault automatically via the subscriber. The eVault envelope for a vote contains: `pollId`, `optionId`, `castAt`, `signature` — a cryptographic personal record.

#### 4.4 — Decision record

When a poll closes, the `Decision` entity is created (already implemented). In Phase 4, additionally:
- `Decision.facilitator_signature` gets populated (the facilitator signs the result using their eID wallet — same pattern as vote signing)
- Decision is synced to the **group eVault** (not personal) — see Phase 5

For now (before Phase 5): sync Decision to the facilitator's personal eVault as a placeholder.

#### 4.5 — Mandate voting with signature

ALVer's mandate (proxy voting) maps directly to eVoting's delegation concept. When a proxy casts a vote on behalf of an absent member:
- The vote record stores: `voter_ename` (proxy), `on_behalf_of_ename` (absent member), `signature` (proxy's signature)
- Two eVault entries are created: one in proxy's eVault, one in the absent member's eVault (same pattern as eCurrency's dual-participant ledger sync — see W3DS_transition.md ledger section)

---

### Phase 5 — Real Group eVault Connection

**Goal:** De Woonwolk gets its own W3DS eVault. Membership is read from the group manifest. Decisions are permanently stored in the group eVault as the official signed record.

**Why last:** Most complex, most W3DS-native. Everything before this can be verified without it.

#### 5.1 — Provision De Woonwolk group eVault

A cooperative gets its own W3DS identity. This is an eVault provisioned for the group itself (not any individual member). The facilitator/admin runs the provisioning script once per group.

Populate `Group.ename` and `Group.evault_uri` from the provisioner output.

#### 5.2 — Group manifest sync

The group eVault holds a **Group Manifest** envelope (schemaId: `550e8400-e29b-41d4-a716-446655440003`). It contains the member list with their W3IDs.

ALVer reads this manifest on login to verify membership instead of the local `GroupMember` table. If someone's ename is in the manifest → they're a member.

`membership.mapping.json` — for syncing member additions back to the group eVault.

#### 5.3 — Decisions synced to group eVault

New mapping: `decisions.mapping.json`

```json
{
  "tableName": "decisions",
  "schemaId": "alver-decision-uuid-tbd",
  "ownerEnamePath": "group_ename",
  "localToUniversalMap": {
    "motion_text": "motionText",
    "result": "result",
    "breakdown": "breakdown",
    "total_votes": "totalVotes",
    "closed_at": "closedAt",
    "facilitator_signature": "facilitatorSignature"
  },
  "readOnly": false
}
```

The group eVault becomes the authoritative record of all decisions. The Archive view can eventually read from the eVault directly instead of the local DB.

#### 5.4 — Webhook from group eVault

Register the group eVault's webhook → ALVer receives notifications when another admin posts a decision or updates the member list. This enables multi-device sync without SSE.

---

## Summary Table

| Phase | What | Depends on | Result |
|-------|------|-----------|--------|
| 1 | eID auth + User entity | nothing | Real identity, JWT |
| 2 | Group membership, facilitator role | Phase 1 | Access control |
| 3 | Platform eVault + outgoing sync | Phase 1 | User/attendance data in eVaults |
| 4 | Signed votes in personal eVaults | Phases 1+3 | Cryptographic vote record |
| 5 | Real group eVault + group manifest | Phases 1–4 | Decentralised group identity |

---

## Files to copy from MetaState prototype

| What | From | Notes |
|------|------|-------|
| `provision-platform.ts` | `platforms/prikbord/api/src/scripts/` | Change displayName to "ALVer" |
| `AuthController.ts` | `platforms/prikbord/api/src/controllers/` | Use exactly — change platform name constant |
| `fetchEVaultProfile()` | `platforms/prikbord/api/src/controllers/AuthController.ts` | Copy verbatim |
| `subscriber.ts` (full pattern) | `W3DS_transition.md` Part 3 / prikbord | Use the timing-correct version |
| Vote signing flow | `platforms/evoting/` | Signing challenge + wallet callback pattern |
| `WebhookController.ts` | `platforms/ecurrency/api/src/controllers/` | Adapt handler map to ALVer schemas |

---

## Schema IDs — ALVer-specific (generate and record here)

| Type | Schema ID |
|------|-----------|
| User profile | `550e8400-e29b-41d4-a716-446655440000` (standard, reuse) |
| Group manifest | `550e8400-e29b-41d4-a716-446655440003` (standard, reuse) |
| Meeting Attendance | _generate new UUID_ |
| Vote (signed) | _check eVoting for their ID first — reuse if exists_ |
| Decision | _generate new UUID_ |

> Fill in the generated UUIDs here and in `.env` before starting Phase 3.

---

## Known differences from other apps (ALVer-specific)

- **No individual posts or messages** — ALVer data is meeting-scoped, not user-content. The "owner" of a vote is the voter; the "owner" of a decision is the group.
- **Mandates = delegations** — ALVer's proxy mandate system maps to eVoting's delegation. Implement with the dual-participant sync pattern (both proxy and absent member get the vote in their eVault).
- **Time-bounded identity** — An Attendee exists only in the context of a meeting. A User persists across meetings. The mapping layer needs to handle this: sync Vote (per meeting) but link it to the persistent User.ename.
- **Facilitator is not a role on the W3DS side** — it's a local GroupMember.role. No W3DS concept needed here; the facilitator signature on a Decision is just them signing with their personal eID key.
- **SSE stays** — W3DS webhooks add interoperability with other platforms; SSE stays for real-time within the app. They serve different purposes.

---

## Prerequisites before starting Phase 1

- [ ] `signature-validator` built: `npm install && npm run build` in `~/Projects/metastate/prototype/infrastructure/signature-validator`
- [ ] eID Wallet app installed on Android device (or dev-sandbox running locally for testing without phone)
- [ ] LAN IP known and reachable from the Android device (for wallet callback)
- [ ] `JWT_SECRET` added to `.env`
- [ ] `PUBLIC_REGISTRY_URL` added to `.env`
