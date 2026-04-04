# ALVer — User Flows & Test Plan

_Last updated: 2026-04-01 — reflects eID-only auth, redesigned attendee flow, new Display layout, vote persistence, auto-close poll._

## Contents

1. [Attendee User Flow](#1-attendee-user-flow)
2. [Attendee Tests](#2-attendee-tests)
3. [Facilitator User Flow](#3-facilitator-user-flow)
4. [Facilitator Tests](#4-facilitator-tests)
5. [Manual Test Reports](#5-manual-test-run-report--2026-03-30)
6. [Display Screen User Flow](#6-display-screen-user-flow)
7. [Display Screen Tests](#7-display-screen-tests)
8. [Post-Audit Advisory](#8-post-audit-advisory)

---

## 1. Attendee User Flow

An attendee is a member of the cooperative housing community. **eID (W3DS wallet) is the only authentication method.** There is no anonymous or name-based login.

### Phase 0 — Pre-meeting registration (from Home `/`)

1. Attendee navigates to `/` and logs in via eID (desktop: scan QR with wallet app; mobile: tap "Open wallet" deep link).
2. After login, `GET /api/auth/me` returns the user's community and member profile.
3. `GET /api/meetings` finds the current open meeting and renders a meeting card.
4. Attendee picks one of three actions:
   - **"I'll come"** — calls `POST /api/meetings/{id}/attendees` with their full name from eID credential. Confirmation stored in `localStorage` key `alver_checkin_{meetingId}` as `{ type: 'attend', name }`.
   - **"Give mandate"** — opens an inline form; attendee selects a proxy from the member dropdown and optionally adds a scope note. Calls `POST /api/meetings/{id}/mandates`. Stored as `{ type: 'mandate', name, proxy }`.
   - **"I can't make it"** — local state only, stored as `{ type: 'decline' }`. No API call.
5. Any registration can be modified ("Modify registration" button) — this revokes the previous pre-registration or mandate before allowing a new action.

### Phase 1 — Day of meeting: check-in via QR

The primary entry point is `/meeting/{id}/attend`, accessed by scanning the QR code on the **Display screen** at the venue.

**eID login (only path):**

1. Attendee scans QR code displayed at the venue → mobile browser opens `/meeting/{id}/attend`.
2. If not logged in → `LoginScreen` renders immediately (no form alternative):
   - **Mobile**: "Open wallet" button with `w3ds://` deep link; underneath a W3DS info block.
   - User authenticates in wallet app.
   - Wallet POSTs credentials to `POST /api/auth/login?returnTo=/meeting/{id}/attend`.
   - API verifies signature, issues JWT, redirects (303) to `/meeting/{id}/attend?session={id}`.
   - Wallet opens browser at that URL.
   - Attend.jsx reads `?session=` on mount, cleans URL, polls `/api/auth/sessions/{id}/result` every 500ms for up to 5 seconds → receives `{ token, user }` → `login()` called.
3. If already logged in → skip to auto-check-in below.

**Auto check-in (fires after login):**

1. `useEffect` detects `user` and `meeting` both loaded, `checkedIn` still false.
2. Constructs full name: `${user.firstName} ${user.lastName}`.
3. Checks `meeting.checkedIn` for this name (case-insensitive).
   - If already present (pre-registered and auto-checked-in on a prior visit) → sets `checkedIn = true` silently.
   - If not present → calls `checkIn(name)` → `POST /api/meetings/{id}/attendees/checkin`.
   - On success: `localStorage.alver_my_name` set, `checkedIn = true`, greeting flash plays for 3 seconds.
   - On failure: error logged, `checkedIn` stays `false`.

### Phase 2 — Waiting (meeting status `open`)

- No polls available.
- Attendee sees meeting name, date, time, location, and agenda (HTML-rendered).
- Attendee count updates live via SSE.

### Phase 3 — Session open (`in_session`), no active poll

- "Waiting for next agenda item" shown; agenda visible below.
- Any closed poll results shown below the waiting card.

### Phase 4 — Active poll

SSE `poll_opened` fires; view re-renders with the VoteCard.

**Voting (regular member):**

1. Poll title and options displayed.
2. If attendee already voted (detected from live `poll.votes[myName]`): confirmation badge shown immediately — no re-vote possible.
3. If not voted: attendee taps one option → `POST /api/polls/{pollId}/votes` called: `{ voter_name, option_id }`.
4. Confirmation badge appears. Vote is locked — buttons replaced by result badge.
5. Progress bar: `totalVotes / attendeeCount` — where `totalVotes = unique own voters + unique mandate granters who had a vote cast on their behalf`.

**Mandate vote (attendee is a proxy):**

1. After casting own vote, a second panel appears: "Vote on behalf of {granter}".
2. If mandate vote already cast (detected from `poll.onBehalfVoters.has(granter)`): confirmation shown.
3. If not cast: attendee taps option → `POST /api/polls/{pollId}/votes` with `{ voter_name, option_id, on_behalf_of_name: granter }`.
4. Server verifies active mandate exists. Confirmation shown.

**Aspirant member:**

- Poll title visible but no vote buttons.
- Notice: "Aspirants cannot vote in this meeting."

**Auto-close:**

- After every vote is recorded, the server checks if `totalCast >= eligible`. If so, `PollService.close()` is called automatically.

### Phase 5 — Poll closes

- SSE `poll_closed` event → view refreshes.
- Closed poll result card shown with tally per option. No "Adopted/Rejected" verdict label — tally only.

### Phase 6 — Meeting archived

- SSE `meeting_status_changed` with `status: 'archived'` → "Meeting closed" screen shown.
- Summary of all poll results (tally per option, no verdict).
- Link to `/meeting/{id}/archive`.

### Mandate grant flow (from Home, before meeting day)

1. Logged-in attendee clicks "Give mandate" on the Home meeting card.
2. Inline form: select proxy from member dropdown; add optional scope note.
3. `POST /api/meetings/{id}/mandates`: `{ granter_name, proxy_name, scope_note }`.
4. Server revokes any pre-existing mandate from the same granter, creates new active mandate.
5. Home card updates to show mandate status: "Mandate given to {proxy}".

---

## 2. Attendee Tests

### 2.1 — eID login (Attend.jsx mobile)

```
describe('eID login on mobile attend screen')

  it('shows LoginScreen immediately when user is not logged in')
    // Setup: no alver_token in localStorage
    // Expected: LoginScreen rendered, no name form, no anonymous option

  it('reads ?session= from URL on mount and polls for token')
    // Setup: page loads at /meeting/xxx/attend?session=yyy
    //        GET /api/auth/sessions/yyy/result returns { token, user }
    // Expected: login() called with token and user
    // Expected: URL cleaned to /meeting/xxx/attend (no ?session= remaining)

  it('polls up to 10 times (5 seconds) before giving up')
    // Setup: /result always returns 204
    // Expected: polling stops after 10 attempts, login screen stays

  it('does not poll if user is already logged in')
    // Setup: user is set, ?session= is present
    // Expected: no pollAuthSessionResult call
```

### 2.2 — Auto check-in (eID user, Attend.jsx)

```
describe('eID auto check-in flow')

  it('auto-checks-in with full name from eID credential')
    // Setup: user = { firstName: 'Sara', lastName: 'Bakker' }
    //        name not in meeting.checkedIn
    // Expected: checkIn('Sara Bakker') called

  it('sets checkedIn=true only after API success')
    // Expected: checkedIn becomes true in .then(), not before

  it('does NOT set checkedIn=true when API call fails')
    // Setup: checkIn() rejects
    // Expected: checkedIn remains false, error logged

  it('detects existing check-in case-insensitively (no duplicate API call)')
    // Setup: meeting.checkedIn includes { name: 'sara bakker' }
    //        user.firstName = 'Sara', user.lastName = 'Bakker'
    // Expected: setCheckedIn(true) called immediately, no API call

  it('stores name in localStorage.alver_my_name after successful check-in')
    // Expected: localStorage.alver_my_name === 'Sara Bakker'
```

### 2.3 — Check-in API

```
describe('POST /api/meetings/:id/attendees/checkin')

  it('checks in an attendee by name')
    // Body: { name: 'Alice' }
    // Expected: 201, status: checked_in, method: app

  it('rejects duplicate check-in (case-insensitive)')
    // Setup: 'Alice' already checked in
    // Body: { name: 'alice' }
    // Expected: returns existing record (idempotent) or 409

  it('rejects check-in on archived meeting')
    // Setup: meeting status 'archived'
    // Expected: 400

  it('emits SSE attendee_checked_in on success')
    // Expected: SSE event received within 1s
```

### 2.4 — Vote persistence (live state)

```
describe('vote state resolved from live poll.votes')

  it('shows vote already cast when poll.votes[myName] is set')
    // Setup: poll.votes = { 'Sara Bakker': optionId }
    //        myName = 'Sara Bakker'
    // Expected: vote confirmation shown, no vote buttons

  it('shows mandate already cast when poll.onBehalfVoters has granter')
    // Setup: poll.onBehalfVoters = Set(['Bob'])
    //        myMandate.from = 'Bob'
    // Expected: mandate confirmation shown

  it('does not allow revoting after page refresh')
    // Setup: vote in DB; page is refreshed → meeting reloaded
    // Expected: vote confirmation visible immediately, no vote buttons
```

### 2.5 — Voting: own vote

```
describe('POST /api/polls/:pollId/votes (own vote)')

  it('records vote when poll is active and option is valid')
    // Body: { voter_name: 'Alice', option_id: 'voor' }
    // Expected: 201, vote record created

  it('rejects vote when poll is not active')
    // Setup: poll status 'closed'
    // Expected: 400

  it('rejects vote with non-existent option_id')
    // Expected: 400

  it('updates existing vote instead of creating duplicate (same voter, same poll)')
    // Setup: Alice voted voor; votes again for tegen
    // Expected: vote updated, still 1 record for Alice
```

### 2.6 — Voting: mandate vote

```
describe('POST /api/polls/:pollId/votes (mandate vote)')

  it('records mandate vote when active mandate exists')
    // Setup: mandate { granter: 'Bob', proxy: 'Alice', status: 'active' }
    // Body: { voter_name: 'Alice', option_id: 'voor', on_behalf_of_name: 'Bob' }
    // Expected: 201

  it('rejects mandate vote when no active mandate exists')
    // Expected: 400 "No active mandate found for this voter"

  it('allows both own vote and mandate vote independently')
    // Expected: 2 vote records with different on_behalf_of_name

  it('updates existing mandate vote instead of duplicating')
    // Setup: Alice already voted on behalf of Bob
    // Action: votes again on behalf of Bob
    // Expected: vote updated, still 1 mandate vote record
```

### 2.7 — Vote count formula

```
describe('totalVotes calculation')

  it('counts unique own voters (Set, not array length)')
    // Setup: poll.votes = { Alice: optId, Bob: optId }
    // Expected: totalVotes includes 2

  it('counts unique mandate granters from onBehalfVoters Set')
    // Setup: poll.onBehalfVoters = Set(['Frank', 'Carol'])
    // Expected: totalVotes includes 2

  it('does not double-count manual votes already in poll.votes')
    // Setup: manual vote for Alice also appears in poll.votes
    // Expected: Alice counted once, not twice
```

### 2.8 — Auto-close poll

```
describe('auto-close when all eligible votes cast')

  it('closes poll when totalCast >= eligible')
    // Setup: 3 eligible voters; 3rd vote submitted
    // Expected: poll status becomes 'closed' after 3rd vote
    // Expected: SSE poll_closed emitted

  it('does not close early when not all have voted')
    // Setup: 3 eligible, 2 voted
    // Expected: poll remains active

  it('correctly counts unbodied mandates in eligible')
    // Setup: 2 checked-in + 1 mandate from absent granter = 3 eligible
    // Expected: auto-close triggers only after 3 votes cast
```

### 2.9 — Aspirant restrictions

```
describe('aspirant voting restrictions')

  it('allows aspirant to check in')
    // Expected: 201, is_aspirant=true

  it('aspirant is excluded from attendeeCount')
    // Setup: 3 non-aspirants + 1 aspirant checked in, 0 mandates
    // Expected: attendeeCount === 3

  it('aspirant cannot receive a mandate')
    // Expected: 400 "Aspirants cannot receive mandates"

  it('aspirant sees poll but cannot vote (buttons absent)')
    // Setup: amAspirant = true, active poll
    // Expected: poll title visible, vote buttons absent, notice shown
```

### 2.10 — Pre-registration from Home

```
describe('pre-registration (Home.jsx attendee view)')

  it('calls POST /attendees with full eID name on "I'll come"')
    // Setup: user = { firstName: 'Sara', lastName: 'Bakker' }
    // Expected: preRegister('Sara Bakker') called

  it('stores { type: attend, name } in localStorage after pre-registration')
    // Expected: alver_checkin_{meetingId} = JSON with type: 'attend'

  it('shows pre-registered status badge on next visit')
    // Setup: localStorage has { type: 'attend' }
    // Expected: "Pre-registered to attend" badge visible, no action buttons

  it('calls POST /mandates on "Give mandate" submit')
    // Setup: proxyName selected, note entered
    // Expected: addMandate(name, proxy, note) called

  it('shows mandate status badge after mandate given')
    // Expected: "Mandate given to {proxy}" badge visible

  it('revokes pre-registration via removeAttendee on "Modify"')
    // Expected: removeAttendee(preReg.id) called, localStorage cleared

  it('shows QR scan hint when meeting is live and no pre-reg exists')
    // Setup: isLive = true, no localPreReg
    // Expected: "Scan QR code at venue" message shown, no navigate-to-attend button
```

### 2.11 — Mandate creation (API)

```
describe('POST /api/meetings/:id/mandates')

  it('creates mandate between two regular members')
    // Body: { granter_name: 'Bob', proxy_name: 'Alice' }
    // Expected: 201, status: active

  it('rejects mandate when proxy is an aspirant')
    // Expected: 400

  it('revokes previous mandate from same granter when new one is created')
    // Setup: existing mandate Bob → Carol
    // Action: POST Bob → Alice
    // Expected: Bob → Carol revoked; Bob → Alice active

  it('emits SSE mandate_updated on creation')
    // Expected: SSE event received
```

### 2.12 — Meeting status transitions (attendee perspective)

```
describe('attendee view reacts to SSE status changes')

  it('shows waiting screen while meeting is open')
    // Expected: no vote buttons, meeting info + agenda shown

  it('shows active poll when poll_opened SSE arrives')
    // Expected: VoteCard rendered with vote buttons

  it('shows closed meeting screen when archived SSE arrives')
    // Expected: "Meeting closed" screen with archive link
```

---

## 3. Facilitator User Flow

A facilitator is a community member with `Member.is_facilitator = true`.

### Phase 0a — Facilitator setup (one-time)

1. Admin opens the Members modal (gear icon in `FacilitatorHeader`).
2. Edits a member → checks "Facilitator" checkbox.
3. `PATCH /api/community/members/{memberId}` with `{ is_facilitator: true }`.
4. **Self-protection**: facilitator cannot change their own `is_facilitator` — the checkbox is disabled when editing own record.

### Phase 0b — Authentication

1. Facilitator navigates to `/facilitator-login`.
2. Desktop: scans eID QR; mobile: taps "Open wallet".
3. Wallet POSTs → JWT issued → `GET /api/auth/me` → `isFacilitator: true`.
4. `loginAsFacilitator(token, user)` called → `localStorage.alver_facilitator_mode = 'true'` → redirect to `/`.
5. If `isFacilitator: false` → error screen shown; `alver_facilitator_mode` NOT set.
6. **Dual-role**: facilitator can simultaneously use their phone (via attendee QR) to attend and vote — separate localStorage per device.

### Phase 1 — Dashboard (Home, facilitator view)

1. `GET /api/meetings` scoped to facilitator's community.
2. Meetings grouped: Active (open/in_session), Upcoming (draft), Archive (archived).
3. Create meeting: `POST /api/meetings` with name, date, time, location, agenda, facilitator dropdown (is_facilitator members only).
4. Edit draft: `PATCH /api/meetings/{id}`.
5. Announce: `PATCH /api/meetings/{id}/status` → `{ status: 'open' }`.
6. Display screen: open `/meeting/{id}/display` in new tab (only shown when meeting is in_session).

### Phase 2 — Facilitate screen (status `open`)

Route: `/meeting/{id}/facilitate`

Top bar stats (live, SSE-updated):
- **Eligible voters** (black) — non-aspirant checked-in + unbodied mandates
- **Mandates** (blue)
- **Total votes in room** (terracotta) — eligible + mandates

Attendees panel:
- EXPECTED: pre-registered attendees with count badge
- CHECKED IN: checked-in attendees with count badge; ✕ to remove (inline confirm)
- "Add without app" modal: select or type name → `POST /api/meetings/{id}/attendees/manual`

Mandate panel:
- List of confirmed mandates; revoke with inline confirm.
- Add mandate modal.

Poll management:
- Create polls (`POST /api/meetings/{id}/polls`, status: `prepared`).
- Edit/delete prepared polls.

Start session: `PATCH /api/meetings/{id}/status` → `{ status: 'in_session' }`.

### Phase 3 — Facilitate screen (status `in_session`)

Same as Phase 2, plus:

- **Open poll**: `PATCH .../polls/{id}/open` → status: `active`. SSE `poll_opened` fires.
- **Monitor votes**: live count via SSE. Progress bar updates.
- **Manual vote**: dropdown of checked-in (non-aspirant) + mandated members; already-voted entries disabled (✓ marker). Calls `POST /api/polls/{pollId}/votes/manual`.
- **Close poll**: `PATCH .../polls/{id}/close` → tally computed, SSE `poll_closed`. Or auto-closes when all eligible votes cast.
- **Close meeting**: `PATCH .../status` → `{ status: 'archived' }`. Inline confirm required.
- **Reopen**: `POST /api/meetings/{id}/reopen` (same calendar day only).

Agenda: HTML-rendered, collapsible with ▶/▼ triangle.

### Phase 4 — Archive review

Route: `/meeting/{id}/archive`

Read-only: attendee list (📝 badge for manually added), confirmed mandates, all closed polls with tally. Available only for `closed` or `archived` meetings.

### Community & settings management

- Logo, name, primary color, title font, location presets, member management — all via Settings modal (gear icon).

---

## 4. Facilitator Tests

### 4.1 — Authentication

```
describe('facilitator authentication')

  it('returns isFacilitator: true for member with is_facilitator=true')
    // Expected: GET /auth/me → { isFacilitator: true }

  it('returns isFacilitator: false for non-facilitator member')
    // Expected: { isFacilitator: false }

  it('returns 401 without token')
  it('returns 401 with expired token')

  it('/facilitator-login rejects non-facilitator ename')
    // Expected: error shown, alver_facilitator_mode NOT set

  it('/facilitator-login accepts facilitator ename')
    // Expected: alver_facilitator_mode === true, redirect to /

  it('rate-limits /api/auth/offer to 30 req / 15 min')
  it('rate-limits /api/auth/login to 30 req / 15 min')
```

### 4.2 — Meeting CRUD

```
describe('POST /api/meetings')
  it('creates meeting with status draft')
  it('requires auth')

describe('PATCH /api/meetings/:id')
  it('updates meeting fields in draft')
  it('updates agenda in open status')
  it('requires auth')
```

### 4.3 — Status transitions

```
describe('PATCH /api/meetings/:id/status')

  it('draft → open')          // ✅
  it('open → in_session')     // ✅
  it('in_session → archived') // ✅
  it('open → draft (forbidden)')       // 400
  it('draft → in_session (forbidden)') // 400
  it('archived → open (forbidden)')    // 400
  it('requires auth')

describe('POST /api/meetings/:id/reopen')
  it('reopens archived → in_session on correct date')
  it('rejects reopen on wrong date')
  it('rejects reopen of non-archived meeting')
```

### 4.4 — Auto-archive

```
  it('auto-archives open meeting with past date on GET /meetings')
  it('does NOT auto-archive in_session meeting with past date')
  it('does NOT auto-archive draft meeting')
```

### 4.5 — Attendee management

```
describe('POST /api/meetings/:id/attendees/manual')
  it('adds attendee method:manual, status:checked_in')
  it('emits SSE attendee_checked_in')
  it('requires auth')

describe('DELETE /api/meetings/:id/attendees/:attendeeId')
  it('removes attendee and emits SSE')
  it('requires auth')
```

### 4.6 — Poll lifecycle

```
describe('poll CRUD')
  it('creates poll status:prepared, emits poll_added SSE')
  it('updates prepared poll motion text')
  it('deletes prepared poll')
  it('requires auth for create/update/delete')

describe('PATCH .../polls/:pollId/open')
  it('opens prepared poll → active, emits poll_opened')
  it('rejects when another poll is active')
  it('rejects when meeting not in_session')
  it('requires auth')

describe('PATCH .../polls/:pollId/close')
  it('closes active poll, computes tally, emits poll_closed')
  it('result contains tally per option (no verdict label)')
  it('requires auth')
```

### 4.7 — Manual vote (facilitator)

```
describe('POST /api/polls/:pollId/votes/manual')
  it('records vote with method:manual')
  it('manual vote on behalf of granter (mandate vote)')
    // Body: { voter_name, option_id, on_behalf_of_name }
    // Expected: 201, on_behalf_of_name set
  it('dropdown excludes already-voted members (UI)')
    // Setup: Alice already voted; manual vote modal opened
    // Expected: Alice row disabled with ✓ marker
  it('requires auth')
```

### 4.8 — attendeeCount correctness

```
describe('attendeeCount calculation')
  it('counts only non-aspirant checked-in members')
  it('adds unbodied mandates (granter not checked in)')
  it('does not double-count granter who is present')
  it('counts mandate from aspirant granter as unbodied')
```

### 4.9 — Facilitator role management

```
describe('PATCH /community/members/:id — is_facilitator')
  it('sets is_facilitator: true')
  it('sets is_facilitator: false')
  it('strips is_facilitator from payload when editing own record (self-protection)')
  it('GET /auth/me returns isFacilitator: true after member set')
  it('MembersModal disables checkbox when editing own record')

describe('Meeting facilitator assignment')
  it('creates meeting with facilitator_name and facilitator_ename')
  it('facilitator name shown on attendee home meeting card')
  it('facilitator dropdown shows only is_facilitator members')
```

### 4.10 — Community settings

```
describe('PATCH /api/community')
  it('updates name, logo, primary_color, title_font')
  it('removes logo when logo_base64 is null')
  it('requires auth')

describe('font CSS injection (CommunityContext)')
  it('strips quotes from font name before setting CSS variable')
  it('uses encodeURIComponent for Google Fonts URL')
```

### 4.11 — SSE integration

```
describe('SSE /api/meetings/:id/stream')
  it('keeps connection alive, sends events')
  it('emits poll_added on poll create')
  it('emits attendee_checked_in on check-in and manual add')
  it('emits mandate_updated on mandate create/revoke')
  it('emits meeting_status_changed on transition')
  it('emits poll_closed with tally on close')
  it('emits vote_cast with running count (no breakdown while open)')
```

### 4.12 — Logout

```
describe('logout (UserContext)')
  it('removes alver_token')
  it('removes alver_my_name')
  it('removes alver_facilitator_mode')
```

---

## 5. Manual Test Run Report — 2026-03-30

> ⚠️ **Note:** This report reflects the state as of 2026-03-30. Several flows have since changed (eID-only auth, removed name forms, redesigned Display). API behavior is unchanged; frontend flows differ.

Tested against: local dev stack (`api` port 3001, `app` port 5174, PostgreSQL in Docker).
Auth: `POST /api/auth/dev-login` → JWT used for all protected calls.

---

### 5.1 — Status transitions

| Test | Expected | Result |
|------|----------|--------|
| `draft → open` | 200, status: open | ✅ PASS |
| `open → draft` (forbidden) | 400 | ✅ PASS |
| `open → archived` (forbidden) | 400 | ✅ PASS |
| `open → in_session` | 200, status: in_session | ✅ PASS |
| `in_session → archived` | 200, status: archived | ✅ PASS |
| Reopen archived on today's date | 200, status: in_session | ✅ PASS |
| Reopen archived on past date | 400 | ✅ PASS |

### 5.2 — Auto-archive

| Test | Expected | Result |
|------|----------|--------|
| `open` + past date → GET /meetings | auto-archived | ✅ PASS |
| `in_session` + past date → GET /meetings | unchanged | ✅ PASS |

### 5.3 — Check-in

| Test | Expected | Result |
|------|----------|--------|
| Check-in new attendee | 201, method: app | ✅ PASS |
| Duplicate check-in (case-insensitive) | idempotent / 409 | ✅ PASS (BUG-1 fix) |
| Check-in on archived meeting | 400 | ✅ PASS (BUG-2 fix) |
| Manual add (facilitator) | 201, method: manual | ✅ PASS |
| Manual add without auth | 401 | ✅ PASS |

### 5.4 — Mandates

| Test | Expected | Result |
|------|----------|--------|
| Create mandate (with auth) | 201, status: active | ✅ PASS |
| Second mandate from same granter revokes first | previous revoked | ✅ PASS |
| Create mandate without auth | 401 | ✅ PASS |
| Fake mandate vote (no active mandate) | 400 | ✅ PASS |

### 5.5 — Polls

| Test | Expected | Result |
|------|----------|--------|
| Create poll | 201, status: prepared | ✅ PASS |
| Open poll → status: active | 200 | ✅ PASS |
| Open poll when meeting NOT in_session | 400 | ✅ PASS (BUG-3 fix) |
| Open second poll while one active | 400 | ✅ PASS |
| Vote on active poll | 201 | ✅ PASS |
| Mandate vote with valid mandate | 201 | ✅ PASS |
| Mandate vote with no mandate | 400 | ✅ PASS |
| Vote with invalid option_id | 400 | ✅ PASS |
| Vote on closed poll | 400 | ✅ PASS |
| Manual vote (facilitator) | 201, method: manual | ✅ PASS |
| Manual vote without auth | 401 | ✅ PASS |

### 5.6 — Auth & rate limiting

| Test | Expected | Result |
|------|----------|--------|
| GET /auth/me with valid JWT | 200, user object | ✅ PASS |
| GET /auth/me without token | 401 | ✅ PASS |
| Rate limit on /auth/offer | limit: 30, window: 900s | ✅ PASS |

### 5.7 — Bugs found & fixed

| Bug | Severity | Fix | Status |
|-----|----------|-----|--------|
| BUG-1 — Duplicate check-in not rejected | HIGH | ILike query + idempotent return | ✅ Fixed |
| BUG-2 — Check-in on archived meeting accepted | HIGH | Meeting status guard in AttendeeService | ✅ Fixed |
| BUG-3 — Poll opened before meeting in_session | MEDIUM | Meeting status check in PollService.open | ✅ Fixed |
| BUG-4 — Double SSE emit on check-in | LOW | Remove duplicate emit from controller | ✅ Fixed |

---

## 6. Display Screen User Flow

The Display screen (`/meeting/:id/display`) runs on a separate device (projector/TV). Read-only, SSE-driven, no auth required.

### Phase 0 — Initial load

1. Facilitator opens `/meeting/:id/display` in a new browser tab.
2. Full meeting loaded; SSE stream subscribed.
3. On any SSE event → full meeting reload (always in sync).

### Phase 1 — Check-in phase (`meeting.phase === 'open'`)

Two-column layout with logo at the top:

**Left column — QR + stats:**
1. **Community logo** centered at top (or `🏛️ ALVer` fallback).
2. **QR code** — scannable, generated client-side via `qrcode` library.
   - URL: `VITE_PUBLIC_ALVER_BASE_URL/meeting/{id}/attend` (dev) or `{window.location.origin}/meeting/{id}/attend` (production).
   - Unique per meeting (contains meeting ID).
   - White background, dark QR pattern.
3. **"Scan to check in"** label below QR.
4. **Stats row** — three numbers:
   - Expected (pre-registered count) — muted
   - Present (checked-in count) — white
   - Mandates (confirmed mandate count) — amber

**Right column — Event info:**
1. Meeting name in large serif font.
2. Date, time, location (with icons).
3. Agenda — HTML-rendered (from WYSIWYG editor), full content visible.

**Greeting animation:**
- When a new check-in arrives via SSE, a full-screen terracotta overlay shows for 3.2 seconds: `👋 {greeting} {firstName}`.
- While showing, it covers both columns entirely.
- Timer resets if another check-in arrives during the animation.

### Phase 2 — Between agenda items (`in_session`, no active poll)

- Meeting name in small caps.
- Large heading: "Session ongoing".
- Single large number: eligible voter count.
- No interactive elements.
- Shown after result reveal auto-dismisses (8 second delay).

### Phase 3a — Active poll

- "VOTING OPEN" label (uppercase, muted).
- Poll title in large serif font.
- Large amber vote count: `unique own voters + unique mandate granters`.
- "X of Y voted" sub-label (Y = attendeeCount).
- Progress bar: gradient, animates on each vote.
- Option pills (labels only — no counts while poll is open).

### Phase 3b — Result reveal (8 seconds after poll closes)

- 2-second dramatic pause, then tally per option (count + label per column).
- No "Adopted/Rejected" verdict label — tally only.
- Auto-dismisses after 8 seconds → Phase 2.

### Phase 4 — Meeting closed (`phase === 'archived'`)

- "Meeting closed" heading.
- Meeting name.
- All closed polls listed: motion text + tally counts per option.

### Cross-cutting

- Language switcher: bottom-right, always visible.
- Corner info: time + location bottom-right.
- Dark background (`#1A1612`) throughout.
- SSE reconnection banner: amber, top of screen.

---

## 7. Display Screen Tests

### 7.1 — Load and SSE

```
describe('Display screen load')
  it('shows loading state before data arrives')
  it('subscribes to SSE stream on mount')
  it('reloads full meeting on any SSE event')
  it('unsubscribes from SSE on unmount')
```

### 7.2 — Check-in phase rendering

```
describe('CheckinDisplay — phase: open')

  it('renders a real QR code image (data URL), not a placeholder')
    // Expected: <img> with src starting "data:image/png;base64,"

  it('QR encodes /meeting/:id/attend with the correct base URL')
    // VITE_PUBLIC_ALVER_BASE_URL set → QR uses that URL
    // VITE_PUBLIC_ALVER_BASE_URL not set → QR uses window.location.origin
    // Expected: URL = {base}/meeting/{meetingId}/attend

  it('QR URL is unique per meeting (contains meeting ID)')
    // Two meetings → two different QR URLs

  it('shows expected (pre-registered) count')
  it('shows checked-in count')
  it('shows mandate count in amber')

  it('shows community logo when available')
    // Expected: <img> with community.logo_url src

  it('shows fallback ALVer text when no logo')
    // Expected: "🏛️ ALVer" text visible

  it('shows agenda HTML-rendered in right column')
    // Setup: meeting.agenda = '<b>Item 1</b>'
    // Expected: bold text visible, not raw HTML string
```

### 7.3 — Greeting animation

```
describe('greeting animation')
  it('triggers full-screen overlay when new check-in arrives via SSE')
  it('uses first name only of newest attendee')
  it('overlay disappears after 3.2 seconds')
  it('overlay covers both columns while visible')
  it('resets timer on second check-in during active greeting')
```

### 7.4 — Active poll display

```
describe('VotingDisplay')
  it('shows poll title')
  it('totalVotes = unique own voters + unique mandate granters (no double-count)')
    // Setup: 3 own votes, 2 mandate votes, 1 manual (already in own votes)
    // Expected: totalVotes = 5, not 6
  it('shows "X of Y voted" where Y is attendeeCount')
  it('progress bar width matches vote percentage')
  it('shows option labels only (no counts while open)')
  it('updates in real time via SSE')
```

### 7.5 — Result reveal

```
describe('ResultDisplay')
  it('triggers when activePoll transitions null → non-null → null')
  it('shows tally per option after 2 second delay')
  it('does NOT show Adopted/Rejected verdict label')
  it('auto-dismisses after 8 seconds')
  it('does not trigger on initial load when poll already closed')
```

### 7.6 — Between agenda items

```
describe('BetweenItems')
  it('shows meeting name and "Session ongoing"')
  it('shows eligible voter count (attendeeCount)')
  it('no poll-related elements shown')
```

### 7.7 — Closed meeting display

```
describe('ClosedDisplay')
  it('shows "Meeting closed" and meeting name')
  it('lists all closed polls with tally per option')
  it('does NOT show Adopted/Rejected verdict labels')
  it('no decisions shown when no polls were closed')
```

### 7.8 — Phase transitions

```
describe('phase logic and priorities')
  it('greeting overlay takes priority over all phase content')
  it('open → in_session transition without page reload')
  it('in_session → archived transition without page reload')
  it('result reveal followed by BetweenItems after 8s')
```

---

## 8. Post-Audit Advisory

### 8.1 — Security `[Fix before any real meeting]`

**Vote endpoint is public — no voter identity verification.**
`POST /api/polls/:pollId/votes` is unauthenticated. Anyone who knows a pollId and a checked-in name can vote on their behalf.
_Recommendation:_ Verify `voter_name` maps to a checked-in attendee in the meeting before recording the vote.

**CORS is wide open.**
`cors({ origin: "*" })` — fine for dev, must be locked to the production domain before going live.

**No rate limiting on voting or check-in endpoints.**
Only auth endpoints are rate-limited. Scripts could spam votes or check-ins.

**`devLogin` route compiled into production binary.**
Only guarded by `NODE_ENV` check in the handler. Wrap the route registration in `if (process.env.NODE_ENV !== 'production')`.

---

### 8.2 — Data integrity `[Fix before legally binding meetings]`

**No unique DB constraint on votes.**
Application-level dedup only. Concurrent requests can bypass it.
_Recommendation:_ Unique index on `(poll_id, voter_name, on_behalf_of_name)`.

**Zero-vote poll marked adopted.**
`Math.max(0,0,0) = 0` → first option wins → `aangenomen: true`. Should be indeterminate/rejected.
_Recommendation:_ `if (total_votes === 0) → aangenomen: false`.

**No transactions on multi-step operations.**
Mandate revoke + create are two separate writes. Crash between them leaves granter without a mandate.

**GET /api/meetings has a write side effect (auto-archive).**
_Recommendation:_ Move auto-archive to a background job or scheduled interval.

---

### 8.3 — Test coverage `[Implement before next feature]`

All tests in this document are manual / planned. None are automated.

_Recommended stack:_ `vitest` + `supertest` (API), `@testing-library/react` (components), `Playwright` (E2E).

_Top 5 tests to write first:_
1. Unique vote constraint (concurrent POSTs — DB must reject duplicate).
2. `attendeeCount` all three edge cases (aspirant, bodied mandate, unbodied mandate).
3. Full poll lifecycle: create → open → vote → auto-close → correct tally.
4. Status transition state machine (all valid + all forbidden in one file).
5. `?session=` exchange on Attend mount — wallet redirect flow.

---

### 8.4 — UX gaps `[Address before meeting with non-technical members]`

✅ **Remove incorrectly added attendee** — `DELETE /api/meetings/:id/attendees/:attendeeId` added; ✕ button in Facilitate screen.

✅ **Confirmation dialogs for irreversible actions** — Inline two-step confirmation for: close poll, close meeting, revoke mandate.

✅ **SSE reconnection indicator** — Amber "Reconnecting…" banner in Attend and Display screens.

**No export of meeting decisions.**
Archive view has no PDF/print export. `GET /api/meetings/:id/decisions` exists but is UI-only.

---

### 8.5 — Mobile eID login (under investigation)

See `bugs.md` for full details.

**Symptom:** Desktop login (eID QR scan) works. Phone browser login (deep link) does not complete.

**Current implementation:**
- Mobile: interval polling every 1.5s while wallet is open
- After wallet auth: API redirects (303) to `returnTo?session=xxx`
- Attend.jsx reads `?session=` on mount, polls `/api/auth/sessions/:id/result`

**Next step:** Check ngrok dashboard (`http://localhost:4040`) and API console (`[Auth]` logs) to identify which of the 4 failure points is hit.
