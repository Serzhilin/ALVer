# Attendee Flow — Technical Reference

## Meeting phases

```
draft → open → in_session → archived
```

- **draft**: not yet visible to attendees
- **open**: check-in phase; QR code shown on Display screen at the venue
- **in_session**: active session; polls running
- **archived**: meeting closed; results visible

---

## Pre-registration (Home screen)

Done from any device, typically before the meeting.

- User authenticates with eID on the Home screen (`/`)
- Clicks "pre-register" → calls `POST /api/meetings/:id/attendees/pre-register`
- Creates an `Attendee` record with `status = 'expected'`
- Confirmation stored in `localStorage` as `alver_checkin_{meetingId}` → `{ type: 'attend', name }`
- Shown on Home as a green "pre-registered" badge with a "Modify" button

Alternatively, user can **give a mandate** instead:
- Picks a proxy member from the list, adds optional note
- Calls `POST /api/meetings/:id/mandates`
- Creates a `Mandate` record with `status = 'active'`, `granter_name`, `proxy_name`
- Stored in localStorage as `{ type: 'mandate', name, proxy }`

Pre-registration is **intent only** — it does not grant access to voting.

---

## Check-in (Attend screen, `open` phase)

The **only** self-service check-in path:

1. Facilitator opens the Display screen (`/meeting/:id/display`) at the venue
2. Display shows a QR code (generated from `VITE_PUBLIC_ALVER_BASE_URL + /:communitySlug/meeting/:id/attend`)
3. Attendee scans QR with phone → opens Attend screen → authenticates with eID wallet
4. `Attend.jsx` effect (`[user?.ename, meeting?.id]`) fires:
   - Computes full name from eID: `firstName + lastName` or `displayName`
   - Checks if already in `meeting.checkedIn` → if yes, sets `checkedIn = true`
   - If not found **and** `meeting.phase === 'open'` → calls `POST /api/meetings/:id/attendees/check-in`
   - On success: sets `checkedIn = true` → shows WaitingScreen
5. Display screen detects the new check-in via SSE → shows a greeting flash for the new attendee

**Important:** QR check-in only fires during `open` phase. If the meeting is already `in_session` when the attendee scans, auto-check-in does NOT happen — they see the locked screen instead.

---

## What each user sees on the Attend screen

### Not logged in (any phase)
→ eID login screen (full-screen, shows meeting name/date/location)

### Logged in, NOT in `checkedIn`

| Phase | Screen shown |
|---|---|
| `open` | Auto-check-in fires (see above) → briefly WaitingScreen while API call resolves → full experience |
| `in_session` | 🔒 Locked screen: "Meeting is in progress. Ask the facilitator to add you manually." |
| `archived` | Results screen (read-only, no vote history since they didn't participate) |

### Logged in, IS in `checkedIn`

| Phase | Screen shown |
|---|---|
| `open` | WaitingScreen — meeting details, date/time/location, agenda |
| `in_session` | Live voting screen (polls, mandate voting if applicable) |
| `archived` | Results screen |

---

## Manual check-in by facilitator (during `in_session`)

The facilitator can add an attendee manually from the Facilitate screen at any time.

When this happens:
- SSE fires → `MeetingContext` reloads meeting data → `meeting.checkedIn` grows
- A second effect in `Attend.jsx` (`[meeting?.checkedIn?.length, myName, checkedIn]`) detects the name appearing in the list
- Sets `checkedIn = true` → the attendee's screen transitions live from the locked screen to the voting screen (including any currently active poll)

**Note:** `myName` must already be set (from the first effect) for this transition to work. This requires the attendee to be logged in with eID on the Attend screen.

---

## Quorum / attendeeCount calculation

`attendeeCount` (used for vote progress bar and display stats) is calculated in `MeetingContext`:

```
checkedInNonAspirants = checkedIn where isAspirant = false
unbodiedMandates = confirmedMandates where:
  - granter is NOT in checkedIn (absent)
  - proxy IS in checkedIn (present)

attendeeCount = checkedInNonAspirants.length + unbodiedMandates.length
```

- **Aspirants** (`is_aspirant = true`): checked in, can see polls, cannot vote
- **Mandate giver who shows up**: their mandate is excluded from the count (no double vote)
- **Mandate proxy**: votes once for themselves + once on behalf of granter (if granter absent)

---

## Multi-tenancy for attendees

ALVer supports multiple communities (cooperatives) in a single installation. Each community has its own members, meetings, branding, and facilitator(s).

### How community is resolved for an attendee

**Before login (unauthenticated):**
- `CommunityContext` calls `GET /api/community/branding` (no auth)
- Returns only branding fields (name, logo, colour, font) for the first community
- Used so the login screen and Display screen look correct before the user authenticates
- This means unauthenticated pages always show the branding of community #1 — fine for single-community installs, a known limitation for multi-community ones

**After eID login:**
- `UserContext.resolveSession()` calls `GET /api/communities` → returns all communities the user belongs to
- **Single community:** auto-selected, stored in `localStorage` as `alver_community_id`
- **Multiple communities:** `communityId` stays `null` → `CommunityPickerGate` intercepts rendering and shows a full-screen picker (`CommunityPicker.jsx`) → user picks → stored in localStorage
- Once `communityId` is set, `CommunityContext` loads full community data (members, settings) via `GET /api/community?communityId=...`

**localStorage keys involved:**
- `alver_community_id` — selected community UUID; persists across sessions
- `alver_token` — eID JWT

### Member validation on check-in and pre-registration

`AttendeeService.resolveMember()` is called on every `checkIn()` and `preRegister()`:
- Looks up the meeting → gets its `community_id`
- If `community_id` is null (legacy meeting): skips validation, allows anyone
- If community exists: looks for a `Member` row matching the name in that community
- Returns `null` (member not found → `not_a_member` error thrown) or the `Member` record

This means **only registered members of the meeting's community can check in or pre-register**. The name match is exact (case-insensitive via `ILike`), so the eID full name (`firstName + lastName`) must match the `Member.name` field exactly.

### URL structure and community slug

All attendee-facing meeting URLs include the community slug:
```
/:communitySlug/meeting/:id/attend
/:communitySlug/meeting/:id/display
/:communitySlug/meeting/:id/archive
```

The slug is cosmetic in the frontend (React Router reads it but doesn't enforce it — meeting ID is the authoritative key). On the API side, meeting ownership is enforced by `community_id` on the `Meeting` entity.

The QR code on the Display screen uses `VITE_PUBLIC_ALVER_BASE_URL` + the community slug + meeting ID — so it always points to the correct community-scoped URL.

### Community branding applied to attendee screens

Once the community is loaded, `applyTheme()` in `CommunityContext` sets CSS variables:
- `--color-terracotta` → `community.primary_color`
- `--font-title` → `community.title_font` (Google Font loaded dynamically)

These cascade to all attendee screens (Attend, Display, Home) without any per-screen logic.

---

## Relevant files

| File | Role |
|---|---|
| `app/src/views/Home.jsx` | Pre-registration and mandate UI |
| `app/src/views/Attend.jsx` | Attendee live screen (check-in logic, poll voting) |
| `app/src/views/Display.jsx` | Venue display screen; QR code shown during `open` phase |
| `app/src/context/MeetingContext.jsx` | SSE subscription, `attendeeCount` calculation, all API actions |
| `api/src/services/AttendeeService.ts` | Check-in logic; blocks `draft` and `archived` phases; `resolveMember` enforces community membership |
| `api/src/services/MandateService.ts` | Mandate creation/revocation |
| `api/src/services/CommunityService.ts` | `findById`, `findAsFacilitator`, `isFacilitatorOf`, branding endpoint |
| `app/src/context/UserContext.jsx` | eID login, `resolveSession`, community selection, localStorage management |
| `app/src/context/CommunityContext.jsx` | Loads community data + members; applies branding theme |
| `app/src/components/CommunityPicker.jsx` | Full-screen picker shown when user belongs to multiple communities |
