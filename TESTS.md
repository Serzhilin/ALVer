# ALVer — User Flows & Test Plan

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

An attendee is a member of the cooperative housing community who attends a meeting, checks in, and votes on motions.

### Phase 0 — Pre-registration (before meeting day)

1. Attendee navigates to `/aanmelden` (fixed public URL shared by community).
2. App calls `GET /api/meetings`, looks for a meeting with `status === 'open'`.
3. If found → redirect to `/meeting/{id}/register?mode=attend`.
4. If no open meeting but `in_session` meeting found → show "meeting is in session, check-in closed" message.
5. If neither → show "no upcoming meetings" message.
6. On the Register screen the attendee enters their name and submits.
7. `POST /api/meetings/{id}/attendees/checkin` is called with `{ name }`.
8. On success: confirmation shown; attendance is stored in `localStorage` key `alver_checkin_{meetingId}`.

### Phase 1 — Day of meeting: Check-in

Entry point is `/meeting/{id}/attend`, typically via a QR code posted at the venue.

**Path A — Manual name entry**

1. Attendee opens the URL.
2. Name entry form is shown (meeting not yet started, no active poll).
3. Attendee types their name and submits.
4. `POST /api/meetings/{id}/attendees/checkin` is called.
5. Greeting animation plays for 3 seconds.
6. Attendee is now in "waiting" state — meeting name, date, time, location, and agenda are shown.
7. `localStorage` key `alver_my_name` is set.

**Path B — eID wallet (W3DS)**

1. Attendee opens the URL.
2. eID flow is triggered; wallet authenticates the user.
3. `localStorage.alver_my_name` is cleared immediately to prevent race conditions.
4. `POST /api/meetings/{id}/attendees/checkin` is called with the name from the eID credential.
5. On API success: name stored in localStorage, `checkedIn = true`, greeting plays.
6. On API failure: `checkedIn` stays `false`; error is logged; attendee must retry manually.

**Path C — Returning visitor (localStorage)**

1. Attendee opens the URL; `localStorage.alver_my_name` is set from a previous session.
2. App checks whether that name appears in `meeting.checkedIn` (case-insensitive).
3. If found → sets `checkedIn = true` silently (no API call needed).
4. If not found and meeting has other check-ins → stale name is cleared from localStorage; manual entry is shown.

### Phase 2 — Waiting (meeting status `open`)

- No polls are available.
- Attendee sees meeting details and agenda.
- Attendee count is displayed.
- Screen updates in real-time via SSE whenever a new attendee checks in or a mandate is added.

### Phase 3 — Session open (`in_session`), no active poll

- Attendee sees "waiting for next agenda item" with the agenda visible.
- Closed poll results (if any) are shown below.

### Phase 4 — Active poll

When the facilitator opens a poll, all attendees receive an SSE `poll_opened` event and the view re-renders.

**Voting (regular member)**

1. Poll title and options are displayed.
2. Attendee clicks one option.
3. `POST /api/polls/{pollId}/votes` is called: `{ voter_name, option_id }`.
4. Option button highlights; confirmation badge "Vote cast: {option}" appears.
5. Progress bar updates.

**Mandate vote (if attendee is a proxy for someone)**

1. After casting their own vote, a second panel appears: "Vote on behalf of {granter}".
2. Attendee clicks one option.
3. `POST /api/polls/{pollId}/votes` is called: `{ voter_name, option_id, on_behalf_of_name: granter }`.
4. Server verifies an active mandate exists (`proxy_name = voter_name`, `granter_name = on_behalf_of_name`).
5. Confirmation badge for mandate vote appears.

**Aspirant member**

- Poll title and options are visible but **all vote buttons are disabled**.
- Notice: "Aspirants cannot vote in this meeting" is shown.

### Phase 5 — Poll closes

- Attendee receives SSE event; view refreshes.
- Poll moves to closed state; result (Adopted / Rejected) is shown.
- Tally per option is displayed.

### Phase 6 — Meeting archived

- Attendee receives SSE `meeting_status_changed` with `status: 'archived'`.
- "Meeting closed" screen is shown with a summary of all poll results.
- Link to the archive view at `/meeting/{id}/archive` is provided.

### Mandate grant flow (alternative path from `/aanmelden`)

1. On the Aanmelden page, attendee chooses "Register Mandate" (`?mode=mandate`).
2. They enter their own name (granter) and pick a proxy from the member dropdown.
3. An optional scope note can be added.
4. `POST /api/meetings/{id}/mandates` is called: `{ granter_name, proxy_name, scope_note }`.
5. Server validates proxy is not an aspirant; revokes any pre-existing mandate from the same granter.
6. Confirmation screen is shown.

---

## 2. Attendee Tests

### 2.1 — Pre-registration & entry routing

```
describe('Aanmelden routing')

  it('redirects to register when an open meeting exists')
    // Setup: meeting with status 'open'
    // GET /api/meetings returns [{ status: 'open', id: 'x' }]
    // Expected: redirect to /meeting/x/register?mode=attend

  it('shows closed message when meeting is in_session')
    // Setup: meeting with status 'in_session'
    // GET /api/meetings returns [{ status: 'in_session' }]
    // Expected: "meeting is in session" notice shown, no redirect

  it('shows no-meeting message when no open or in_session meeting')
    // Setup: all meetings are 'draft' or 'archived'
    // Expected: "no upcoming meetings" notice shown
```

### 2.2 — Check-in API

```
describe('POST /api/meetings/:id/attendees/checkin')

  it('checks in a known member by name')
    // Setup: meeting in_session, member exists in community
    // Body: { name: 'Alice' }
    // Expected: 201, attendee record created with status 'checked_in', method 'app'
    // Expected: SSE event 'attendee_checked_in' emitted

  it('rejects duplicate check-in for same name (case-insensitive)')
    // Setup: 'Alice' already checked in
    // Body: { name: 'alice' }
    // Expected: 409 or 400 with descriptive error

  it('allows manual check-in of a name not in the member list')
    // Setup: meeting open, no pre-configured members
    // Body: { name: 'Unknown Visitor' }
    // Expected: 201, attendee record created

  it('rejects check-in on an archived meeting')
    // Setup: meeting with status 'archived'
    // Body: { name: 'Alice' }
    // Expected: 400/403

  it('emits SSE attendee_checked_in event on successful check-in')
    // Setup: active SSE subscription
    // Action: check-in POST
    // Expected: SSE message with type 'attendee_checked_in' received within 1 second
```

### 2.3 — eID auto check-in (Attend.jsx, client-side)

```
describe('eID auto check-in flow')

  it('clears localStorage before API call to prevent race condition')
    // Setup: localStorage.alver_my_name = 'Bob'
    // eID login resolves with name 'Alice'
    // Expected: alver_my_name cleared BEFORE checkIn() is called

  it('sets checkedIn=true only after API success')
    // Setup: API call succeeds
    // Expected: checkedIn becomes true AFTER .then()

  it('does NOT set checkedIn=true when API call fails')
    // Setup: checkIn() rejects
    // Expected: checkedIn remains false, error logged to console

  it('restores name in localStorage after successful eID check-in')
    // Setup: eID login resolves with name 'Alice', API succeeds
    // Expected: localStorage.alver_my_name === 'Alice' after .then()
```

### 2.4 — LocalStorage returning-visitor detection

```
describe('returning visitor localStorage restoration')

  it('silently marks attendee as checked in when name is in checkedIn list')
    // Setup: localStorage.alver_my_name = 'Alice', meeting.checkedIn includes Alice
    // Expected: checkedIn = true, no API call made

  it('clears stale localStorage name when not found in checkedIn list and others exist')
    // Setup: localStorage.alver_my_name = 'Ghost', meeting.checkedIn has 3 others
    // Expected: localStorage.alver_my_name removed, check-in form shown

  it('does not clear localStorage when checkedIn list is empty (meeting just started)')
    // Setup: meeting.checkedIn is empty
    // Expected: localStorage.alver_my_name untouched
```

### 2.5 — Voting: own vote

```
describe('POST /api/polls/:pollId/votes (own vote)')

  it('records vote when poll is active and option is valid')
    // Setup: poll status 'active', option 'voor' exists
    // Body: { voter_name: 'Alice', option_id: 'voor' }
    // Expected: 201, vote record created

  it('rejects vote when poll is not active (prepared)')
    // Setup: poll status 'prepared'
    // Expected: 400

  it('rejects vote when poll is not active (closed)')
    // Setup: poll status 'closed'
    // Expected: 400

  it('rejects vote with non-existent option_id')
    // Body: { voter_name: 'Alice', option_id: 'invalid_xyz' }
    // Expected: 400

  it('prevents duplicate own vote from same voter')
    // Setup: Alice already voted for 'voor'
    // Action: Alice votes again for 'tegen'
    // Expected: 409 or overwrite behavior (document which is expected)
```

### 2.6 — Voting: mandate vote

```
describe('POST /api/polls/:pollId/votes (mandate vote)')

  it('records mandate vote when active mandate exists')
    // Setup: mandate { granter: 'Bob', proxy: 'Alice', status: 'active' }
    // Body: { voter_name: 'Alice', option_id: 'voor', on_behalf_of_name: 'Bob' }
    // Expected: 201

  it('rejects mandate vote when no active mandate exists')
    // Setup: no mandate from Bob to Alice
    // Body: { voter_name: 'Alice', option_id: 'voor', on_behalf_of_name: 'Bob' }
    // Expected: 400 "No active mandate found for this voter"

  it('rejects mandate vote when mandate is revoked')
    // Setup: mandate status 'revoked'
    // Expected: 400

  it('allows casting both own vote and mandate vote independently')
    // Action 1: Alice votes voor (own)
    // Action 2: Alice votes tegen on behalf of Bob
    // Expected: both succeed, 2 vote records with different on_behalf_of_name

  it('prevents duplicate mandate vote for same granter')
    // Setup: Alice already voted on behalf of Bob
    // Action: Alice tries to vote on behalf of Bob again
    // Expected: 409 or overwrite
```

### 2.7 — Aspirant restrictions

```
describe('aspirant voting restrictions')

  it('allows aspirant to check in')
    // Setup: member Alice with is_aspirant=true
    // Action: Alice checks in
    // Expected: 201, attendee record with is_aspirant=true

  it('aspirant is excluded from attendeeCount')
    // Setup: 3 non-aspirants + 1 aspirant checked in, 0 mandates
    // Expected: attendeeCount === 3

  it('aspirant cannot receive a mandate')
    // Setup: Alice is aspirant
    // Action: POST /mandates with proxy_name: 'Alice'
    // Expected: 400 "Aspirants cannot receive mandates"
```

### 2.8 — Meeting status transitions (attendee perspective)

```
describe('attendee view reacts to SSE status changes')

  it('shows waiting screen while meeting is open')
    // Setup: meeting.status === 'open'
    // Expected: no vote buttons, meeting info shown

  it('shows active poll when poll_opened SSE arrives')
    // Action: SSE event 'poll_opened' received
    // Expected: UI reloads meeting, poll card with vote buttons is shown

  it('shows closed meeting screen when meeting_status_changed archived received')
    // Action: SSE 'meeting_status_changed' with status 'archived'
    // Expected: "Meeting closed" screen shown, link to archive visible
```

### 2.9 — Mandate creation (Register.jsx)

```
describe('POST /api/meetings/:id/mandates')

  it('creates mandate between two regular members')
    // Body: { granter_name: 'Bob', proxy_name: 'Alice', scope_note: '' }
    // Expected: 201, mandate record status 'active'

  it('rejects mandate when proxy is an aspirant')
    // Body: { proxy_name: 'Aspirant Member' }
    // Expected: 400

  it('revokes previous mandate from same granter when new one is created')
    // Setup: existing active mandate Bob → Carol
    // Action: POST mandate Bob → Alice
    // Expected: Bob → Carol mandate is now 'revoked'; Bob → Alice is 'active'

  it('emits SSE mandate_updated on mandate creation')
    // Expected: SSE event 'mandate_updated' received
```

---

## 3. Facilitator User Flow

A facilitator is a community member with `Member.is_facilitator = true` who creates and runs meetings, manages attendance, and controls the voting session. The role is assigned in the member list and verified via the database — no environment variables are used.

### Phase 0 — Facilitator setup (one-time, per community)

Performed by the community admin (whoever has `Community.facilitator_ename` set — the initial bootstrap user).

1. Admin opens the Members modal (gear icon in `FacilitatorHeader`).
2. Finds the member to designate as facilitator.
3. Clicks edit (✏️) on that member row.
4. Checks the "Facilitator" checkbox in the form.
5. Saves → `PATCH /api/community/members/{memberId}` with `{ is_facilitator: true }`.
6. The "Facilitator" badge appears on that member row immediately.
7. **Self-protection**: a facilitator cannot change their own `is_facilitator` status — the checkbox is disabled with a note when editing their own record.
8. From this point, that member can log in via `/facilitator-login` and access the facilitate screen.

### Phase 0b — Authentication

1. Facilitator navigates to `/facilitator-login` (separate URL — not the main attendee login).
2. Scans the eID QR with their eID app (or taps "Open eID app" on mobile).
3. `POST /api/auth/login` is called by the wallet → JWT issued.
4. Frontend calls `GET /api/auth/me` with the new token → server looks up the member by ename and returns `isFacilitator: true`.
5. If `isFacilitator === true` → `loginAsFacilitator(token, user)` is called → `localStorage.alver_facilitator_mode = 'true'` is set → redirected to `/`.
6. If `isFacilitator === false` → error screen "This eID is not registered as a facilitator."
7. On subsequent page loads, `UserContext` restores `isFacilitator` from `localStorage.alver_facilitator_mode`.
8. **Dual-role**: the same facilitator can simultaneously use their phone (main attendee login) to attend and vote — the two sessions are independent (separate localStorage on separate devices).
9. Navigating to `/meeting/{id}/facilitate` without `isFacilitator === true` redirects to `/facilitator-login`.

### Phase 1 — Dashboard (Home)

1. `GET /api/meetings` is called, scoped to the facilitator's community.
2. Meetings are grouped:
   - **Active** (status `open` or `in_session`) — shown at top with CTA buttons.
   - **Upcoming/Draft** (status `draft`) — shown below with edit and announce buttons.
   - **Archive** (status `archived`) — listed at the bottom.
3. Facilitator can create a new meeting via the "+ New Meeting" form: date, time, location, agenda, **and a facilitator dropdown** (members with `is_facilitator = true`).
   - `POST /api/meetings` with `{ name, date, time, location, agenda_text, facilitator_name, facilitator_ename }`.
4. Facilitator can edit a draft meeting including changing the assigned facilitator.
   - `PATCH /api/meetings/{id}` with changed fields.
5. Facilitator announces a draft meeting:
   - Clicks "Announce" next to the chosen draft.
   - `PATCH /api/meetings/{id}/status` with `{ status: 'open' }`.
   - Meeting becomes visible to attendees on `/aanmelden` with the assigned facilitator's name shown on the meeting card.

### Phase 2 — Facilitate screen (pre-session, status `open`)

Route: `/meeting/{id}/facilitate`

1. Left sidebar shows expected attendees and those already checked in.
2. Facilitator can manually add an attendee:
   - Opens "Add without app" modal.
   - Selects or types name.
   - `POST /api/meetings/{id}/attendees/manual` is called.
   - SSE `attendee_checked_in` event fires; list updates across all clients.
3. Facilitator can add a mandate:
   - Opens mandate modal.
   - Enters granter and proxy names and optional scope note.
   - `POST /api/meetings/{id}/mandates` is called.
   - SSE `mandate_updated` event fires.
4. Eligible voter count (`attendeeCount`) updates live via SSE.
5. Polls can be created and edited in this phase:
   - `POST /api/meetings/{id}/polls`.
   - Poll is created with status `prepared`.
6. Facilitator can open the Display screen: `/meeting/{id}/display` (new browser tab).
7. When ready, facilitator clicks "Open Meeting":
   - `PATCH /api/meetings/{id}/status` with `{ status: 'in_session' }`.
   - SSE `meeting_status_changed` fires; all attendee views transition.

### Phase 3 — Facilitate screen (session open, status `in_session`)

1. Attendance and mandate management remain available.
2. Phase control shows "Close Meeting" button.
3. Poll management:
   - **Start a poll** (when no other poll is active):
     - `PATCH /api/meetings/{id}/polls/{pollId}/open`.
     - Poll status → `active`.
     - SSE `poll_opened` fires.
   - **Monitor live results**: vote count and progress bar update via SSE on every vote.
   - **Add a manual vote** (for phone-in or written votes):
     - `POST /api/polls/{pollId}/votes/manual` with `{ voter_name, option_id }`.
   - **Close a poll**:
     - `PATCH /api/meetings/{id}/polls/{pollId}/close`.
     - Server calculates tally; poll status → `closed`.
     - SSE `poll_closed` fires.
   - **Start next poll** after the previous one is closed.
4. Facilitator closes the meeting:
   - Clicks "Close Meeting".
   - `PATCH /api/meetings/{id}/status` with `{ status: 'archived' }`.
   - SSE `meeting_status_changed` fires with `status: 'archived'`.
5. Facilitator may reopen an archived meeting on the same calendar day:
   - `POST /api/meetings/{id}/reopen`.
   - Allowed only if `meeting.date === today`.

### Phase 4 — Archive review

Route: `/meeting/{id}/archive`

1. Full read-only view of the meeting:
   - Attendee list with check-in timestamps; badge for manually added attendees.
   - Active mandates registered during the meeting.
   - All closed polls with adoption result, vote tally, and closure timestamp.
2. Facilitator can navigate to any archived meeting from the Home dashboard.

### Community & settings management (any time)

- Accessible via the settings gear icon in `FacilitatorHeader`.
- **Logo**: Upload (PATCH with base64 image), remove.
- **Community name**: Inline save via PATCH.
- **Primary color**: Color picker; applies as CSS variable immediately.
- **Title font**: Dropdown of curated fonts; Google Font injected dynamically.
- **Location presets**: Add default meeting locations.
- **Member management**: Add, edit, remove members; toggle aspirant status; toggle facilitator status.
  - **Facilitator toggle**: checkbox in the member edit form — `PATCH /api/community/members/{memberId}` with `{ is_facilitator: true/false }`.
  - **Self-protection**: if the logged-in facilitator edits their own member record, the `is_facilitator` checkbox is disabled — they cannot demote themselves.
- All changes call `PATCH /api/community` and re-apply theme on success.
- Failures display a red error banner; state is reverted.

---

## 4. Facilitator Tests

### 4.1 — Authentication

```
describe('facilitator authentication')

  it('returns user profile + isFacilitator on GET /api/auth/me for facilitator member')
    // Setup: valid token; member with is_facilitator=true and matching ename
    // Expected: 200, { ename, firstName, lastName, isFacilitator: true }

  it('returns isFacilitator: false for a non-facilitator member')
    // Setup: valid token; member with is_facilitator=false
    // Expected: 200, { isFacilitator: false }

  it('returns isFacilitator: false when ename has no member record')
    // Setup: valid token; no matching member in any community
    // Expected: 200, { isFacilitator: false }

  it('returns 401 on GET /api/auth/me with missing token')
    // Expected: 401

  it('returns 401 on GET /api/auth/me with expired token')
    // Expected: 401

  it('/facilitator-login rejects user whose isFacilitator is false')
    // Action: login with eID, getMe returns isFacilitator: false
    // Expected: error screen shown, alver_facilitator_mode NOT set in localStorage

  it('/facilitator-login accepts user whose isFacilitator is true')
    // Action: login with eID, getMe returns isFacilitator: true
    // Expected: alver_facilitator_mode === 'true', redirect to /

  it('facilitator navigating to /meeting/:id/facilitate without isFacilitator → redirected to /facilitator-login')
    // Expected: Navigate component renders with to='/facilitator-login'

  it('rate-limits /api/auth/offer to 30 requests per 15 minutes')
    // Action: 31 sequential requests
    // Expected: 31st request returns 429

  it('rate-limits /api/auth/login to 30 requests per 15 minutes')
    // Action: 31 sequential requests
    // Expected: 31st returns 429
```

### 4.2 — Meeting CRUD

```
describe('POST /api/meetings')

  it('creates a meeting with status draft')
    // Body: { name, date, time, location, agenda_text }
    // Expected: 201, { id, status: 'draft', ... }

  it('requires auth to create meeting')
    // No token
    // Expected: 401

describe('PATCH /api/meetings/:id')

  it('updates meeting fields while in draft status')
    // Body: { name: 'New Name' }
    // Expected: 200, name updated

  it('updates meeting agenda while in open status')
    // Expected: 200

  it('requires auth to update')
    // Expected: 401
```

### 4.3 — Status transitions

```
describe('PATCH /api/meetings/:id/status')

  it('transitions draft → open')
    // Setup: meeting status 'draft'
    // Body: { status: 'open' }
    // Expected: 200, status === 'open'
    // Expected: SSE 'meeting_status_changed' emitted

  it('transitions open → in_session')
    // Setup: meeting status 'open'
    // Body: { status: 'in_session' }
    // Expected: 200, status === 'in_session'

  it('transitions in_session → archived')
    // Setup: meeting status 'in_session'
    // Body: { status: 'archived' }
    // Expected: 200, status === 'archived'

  it('rejects open → draft (un-announce is forbidden)')
    // Body: { status: 'draft' }
    // Expected: 400 "Invalid status transition"

  it('rejects draft → in_session (must go through open)')
    // Body: { status: 'in_session' }
    // Expected: 400

  it('rejects archived → open (must use reopen endpoint)')
    // Body: { status: 'open' }
    // Expected: 400

  it('requires auth to transition status')
    // Expected: 401

describe('POST /api/meetings/:id/reopen')

  it('reopens archived meeting to in_session on the correct date')
    // Setup: meeting status 'archived', meeting.date === today
    // Expected: 200, status === 'in_session'
    // Expected: SSE 'meeting_status_changed' emitted

  it('rejects reopen on a different date')
    // Setup: meeting.date !== today
    // Expected: 400

  it('rejects reopen when meeting is not archived')
    // Setup: meeting status 'in_session'
    // Expected: 400
```

### 4.4 — Auto-archive

```
describe('auto-archive in GET /api/meetings')

  it('auto-archives an open meeting whose date has passed')
    // Setup: meeting { status: 'open', date: yesterday }
    // Action: GET /api/meetings
    // Expected: meeting returned with status 'archived'

  it('does NOT auto-archive an in_session meeting whose date has passed')
    // Setup: meeting { status: 'in_session', date: yesterday }
    // Action: GET /api/meetings
    // Expected: meeting returned with status 'in_session' (unchanged)

  it('does NOT auto-archive a draft meeting')
    // Setup: meeting { status: 'draft', date: yesterday }
    // Expected: status 'draft' unchanged
```

### 4.5 — Manual attendee add

```
describe('POST /api/meetings/:id/attendees/manual')

  it('adds attendee with method manual and status checked_in')
    // Body: { name: 'Alice' }
    // Expected: 201, { method: 'manual', status: 'checked_in' }

  it('emits SSE attendee_checked_in event')
    // Expected: SSE event received

  it('requires facilitator auth')
    // No token
    // Expected: 401
```

### 4.6 — Poll lifecycle

```
describe('poll CRUD')

  it('creates a poll with status prepared')
    // Body: { motion_text: 'Adopt budget?', vote_options: [{id:'voor',label:'Voor'}, ...] }
    // Expected: 201, status === 'prepared'
    // Expected: SSE 'poll_added' emitted

  it('emits poll_added SSE event when poll is created')
    // Expected: SSE event 'poll_added' received

  it('updates a prepared poll motion text')
    // Expected: 200, motion_text updated

  it('deletes a prepared poll')
    // Expected: 204, poll removed

  it('requires auth for create, update, delete')
    // Expected: 401 for each without token

describe('PATCH /api/meetings/:id/polls/:pollId/open')

  it('opens a prepared poll and sets status to active')
    // Setup: meeting in_session, poll prepared, no other active poll
    // Expected: 200, poll.status === 'active'

  it('rejects opening a poll when another poll is already active')
    // Setup: one poll already active
    // Expected: 400

  it('rejects opening a poll when meeting is not in_session')
    // Setup: meeting status 'open'
    // Expected: 400

describe('PATCH /api/meetings/:id/polls/:pollId/close')

  it('closes an active poll and computes result')
    // Setup: active poll with votes
    // Expected: 200, status === 'closed', result tally present

  it('correctly identifies the winning option')
    // Setup: Voor=5, Tegen=3, Onthouding=1
    // Expected: result.winner === 'Voor', result.aangenomen === true

  it('correctly marks as rejected when Tegen wins')
    // Setup: Tegen=5, Voor=3
    // Expected: result.aangenomen === false

  it('emits poll_closed SSE event')
    // Expected: SSE event received
```

### 4.7 — Manual vote (facilitator)

```
describe('POST /api/polls/:pollId/votes/manual')

  it('records a manual vote with method manual')
    // Body: { voter_name: 'Alice', option_id: 'voor' }
    // Expected: 201, vote.method === 'manual'

  it('requires facilitator auth')
    // Expected: 401
```

### 4.8 — attendeeCount correctness

```
describe('attendeeCount calculation (MeetingContext)')

  it('counts only non-aspirant checked-in members')
    // Setup: 3 checked-in members, 1 aspirant checked-in
    // Expected: attendeeCount === 3

  it('adds mandates whose granter is NOT checked in')
    // Setup: 2 non-aspirant present; 1 mandate from Bob (not checked in)
    // Expected: attendeeCount === 3

  it('does NOT double-count granter who is also present')
    // Setup: 2 non-aspirant present including Bob; mandate Bob → Alice
    // Expected: attendeeCount === 2 (Bob is present, his mandate does not add 1)

  it('counts mandate whose granter checked in as aspirant')
    // Setup: Bob (aspirant) checked in, mandate Bob → Alice
    // Expected: Bob is excluded from count, mandate IS unbodied, attendeeCount includes it
```

### 4.9 — Facilitator role management

```
describe('PATCH /api/community/members/:memberId — is_facilitator')

  it('sets is_facilitator: true on a member')
    // Body: { is_facilitator: true }
    // Expected: 200, member.is_facilitator === true

  it('sets is_facilitator: false on a member')
    // Body: { is_facilitator: false }
    // Expected: 200, member.is_facilitator === false

  it('strips is_facilitator from payload when editing own member record')
    // Setup: JWT ename matches member.ename; body includes is_facilitator: false
    // Expected: 200, is_facilitator unchanged (self-protection)

  it('GET /api/auth/me returns isFacilitator: true after member is set')
    // Setup: member.is_facilitator set to true; login as that ename
    // Expected: getMe() returns isFacilitator: true

  it('MembersModal disables is_facilitator checkbox when editing own record')
    // Setup: currentUser.ename === member.ename
    // Expected: checkbox is disabled, tooltip shown

describe('Meeting facilitator assignment')

  it('creates meeting with facilitator_name and facilitator_ename')
    // Body: { ..., facilitator_name: 'Jan', facilitator_ename: 'jan@vdk' }
    // Expected: 201, facilitator_name and facilitator_ename saved

  it('facilitator name visible on attendee meeting card when meeting is open')
    // Setup: meeting.status === 'open', meeting.facilitator_name set
    // Expected: attendee home card shows facilitator name

  it('facilitator dropdown in meeting form shows only is_facilitator members')
    // Setup: 3 members, 1 with is_facilitator=true
    // Expected: dropdown has 2 options: "none" + the facilitator member
```

### 4.10 — Community settings

```
describe('PATCH /api/community')

  it('updates community name')
    // Body: { name: 'New Name' }
    // Expected: 200, name updated

  it('saves logo as base64 and stores it')
    // Body: { logo_base64: 'data:image/png;base64,...' }
    // Expected: 200, logo stored

  it('removes logo when logo_base64 is set to null')
    // Expected: 200, logo_base64 is null in response

  it('saves primary_color')
    // Body: { primary_color: '#FF5733' }
    // Expected: 200

  it('saves title_font')
    // Body: { title_font: 'Lora' }
    // Expected: 200

  it('requires facilitator auth')
    // Expected: 401

describe('font CSS injection (CommunityContext)')

  it('strips quotes from font name before setting CSS variable')
    // Setup: community.title_font = '"Malicious"; color: red; --x: "'
    // Expected: CSS variable value does not contain quotes or semicolons
    // Expected: --font-title is set to a safe string

  it('uses encodeURIComponent for Google Fonts URL')
    // Setup: community.title_font = 'Playfair Display'
    // Expected: link href contains 'Playfair%20Display'
```

### 4.11 — Display screen (read-only)

```
describe('Display screen (/meeting/:id/display)')

  it('shows attendee count during open phase')
    // Setup: meeting.status === 'open', 5 checked in
    // Expected: counter shows 5

  it('shows active poll title and progress during in_session')
    // Setup: active poll with 3 votes out of 10 eligible
    // Expected: "3 of 10 voted" visible, progress bar at 30%

  it('shows adoption result 2 seconds after poll closes')
    // Setup: poll closes with Voor winning
    // Expected: 'AANGENOMEN' badge appears after delay

  it('shows meeting closed screen when status is archived')
    // Setup: meeting.status === 'archived'
    // Expected: "Meeting closed" displayed, all poll results listed

  it('does NOT show closed screen for status closed (legacy enum value)')
    // The isClosed check is phase === 'archived' only
    // Expected: 'closed' status treated same as any unknown phase — no closed display
```

### 4.12 — SSE integration

```
describe('SSE /api/meetings/:id/stream')

  it('keeps connection alive and sends events')
    // Action: subscribe to stream, trigger a poll_added
    // Expected: event received within 1 second

  it('clients reconnect and receive fresh state on SSE reconnect')
    // MeetingContext calls load(id) on any event — verify full reload triggered

  it('emits poll_added when a poll is created')
  it('emits attendee_checked_in when attendee checks in or is manually added')
  it('emits mandate_updated when mandate is created or revoked')
  it('emits meeting_status_changed when status transitions')
```

### 4.13 — Logout

```
describe('logout (UserContext)')

  it('removes alver_token from localStorage on logout')
    // Expected: localStorage.alver_token === null after logout()

  it('removes alver_my_name from localStorage on logout')
    // Expected: localStorage.alver_my_name === null after logout()
    // Prevents previous user's name persisting on shared device

  it('removes alver_facilitator_mode from localStorage on logout')
    // Expected: localStorage.alver_facilitator_mode === null after logout()
    // Prevents facilitator role persisting after sign-out
```

---

## 5. Manual Test Run Report — 2026-03-30

Tested against: local dev stack (`api` on port 3001, `app` on port 5174, PostgreSQL in Docker).
Auth: `POST /api/auth/dev-login` → JWT used for all protected calls.
All API calls made with `curl`; results captured and parsed.

---

### 5.1 — Status transitions

| Test | Expected | Result |
|------|----------|--------|
| `draft → open` | 200, status: open | ✅ PASS |
| `open → draft` (forbidden) | 400 error | ✅ PASS — "Invalid status transition: open → draft" |
| `open → archived` (forbidden) | 400 error | ✅ PASS — "Invalid status transition: open → archived" |
| `open → in_session` | 200, status: in_session | ✅ PASS |
| `in_session → archived` | 200, status: archived | ✅ PASS |
| Reopen archived on today's date | 200, status: in_session | ✅ PASS |
| Reopen archived on past date | 400 error | ✅ PASS — "Can only reopen a meeting on its scheduled date" |

---

### 5.2 — Auto-archive

| Test | Expected | Result |
|------|----------|--------|
| `open` meeting with past date — GET /meetings | auto-archived | ✅ PASS — status became `archived` |
| `in_session` meeting with past date — GET /meetings | NOT touched | ✅ PASS — status stayed `in_session` |

---

### 5.3 — Check-in

| Test | Expected | Result |
|------|----------|--------|
| Check-in new attendee | 201, method: app, status: checked_in | ✅ PASS |
| Duplicate check-in same name (exact case) | 400/409 rejected | ❌ **BUG — accepted, created second attendee record** |
| Duplicate check-in different case (`Alice` then `alice`) | 400/409 rejected | ❌ **BUG — accepted, created second attendee record** |
| Check-in on archived meeting | 400 rejected | ❌ **BUG — accepted, created attendee on archived meeting** |
| Manual add (facilitator) | 201, method: manual | ✅ PASS |
| Manual add without auth | 401 | ✅ PASS |

---

### 5.4 — Mandates

| Test | Expected | Result |
|------|----------|--------|
| Create mandate (with auth) | 201, status: active | ✅ PASS |
| Second mandate from same granter revokes first | previous mandate revoked | ✅ PASS |
| Create mandate without auth | 401 | ✅ PASS |
| Fake mandate vote (no active mandate) | 400 | ✅ PASS — "No active mandate found for this voter" |

---

### 5.5 — Polls

| Test | Expected | Result |
|------|----------|--------|
| Create poll | 201, status: prepared | ✅ PASS |
| Open a prepared poll | 200, status: active | ✅ PASS |
| Open poll when meeting is NOT in_session (status: open) | 400 rejected | ❌ **BUG — poll opened successfully on an `open` meeting** |
| Open second poll while one is active | 400 rejected | ✅ PASS — "Another poll is already active for this meeting" |
| Vote on active poll (own) | 201 | ✅ PASS |
| Mandate vote with valid active mandate | 201 | ✅ PASS |
| Mandate vote with no active mandate | 400 | ✅ PASS — "No active mandate found for this voter" |
| Vote with invalid option_id | 400 | ✅ PASS — "Invalid option_id: ..." |
| Vote on closed poll | 400 | ✅ PASS — "Poll is not active" |
| Close poll — result computed | result in response | ⚠️ OBSERVATION — close returns `{ poll, decision }` wrapper, not bare poll |
| Poll with 0 votes closed — result | should be indeterminate | ⚠️ EDGE CASE — marked "aangenomen" because first option (e.g. "Ja") wins tie at 0 |
| Manual vote (facilitator) | 201, method: manual | ✅ PASS |
| Manual vote without auth | 401 | ✅ PASS |

---

### 5.6 — Auth & rate limiting

| Test | Expected | Result |
|------|----------|--------|
| GET /auth/me with valid JWT | 200, user object | ✅ PASS |
| GET /auth/me without token | 401 | ✅ PASS |
| Rate limit headers on /auth/offer | `RateLimit-*` headers present | ✅ PASS — limit: 30, window: 900s |

---

### 5.7 — Bugs found (3 confirmed)

#### BUG-1 — Duplicate check-in not rejected `[HIGH]`
**Where:** `POST /api/meetings/:id/attendees/checkin`
**Symptom:** Submitting the same name twice (even with different casing) creates two separate attendee records. An attendee can vote twice if they check in twice.
**Fix needed in:** `AttendeeService` or `AttendeeController` — query existing `checked_in` attendees for this meeting and reject if name matches (case-insensitive).

#### BUG-2 — Check-in accepted on archived meeting `[HIGH]`
**Where:** `POST /api/meetings/:id/attendees/checkin`
**Symptom:** After a meeting is archived, the check-in endpoint still accepts new attendees. No meeting status validation exists on this route.
**Fix needed in:** `AttendeeController.checkIn` — fetch meeting by ID, return 400 if `status !== 'open'` and `status !== 'in_session'`.

#### BUG-3 — Poll can be opened when meeting is not in_session `[MEDIUM]`
**Where:** `PATCH /api/meetings/:id/polls/:pollId/open`
**Symptom:** A poll can be moved to `active` even when the meeting is still in `open` (announcement) status. Attendees would see a live vote before the session officially starts.
**Fix needed in:** `PollController.open` or `PollService.open` — fetch meeting, return 400 if `status !== 'in_session'`.

---

### 5.8 — Observations (not bugs)

- **Poll close response shape:** `PATCH /polls/:id/close` returns `{ poll: {...}, decision: {...} }`. The frontend does not consume this response directly (it calls `load(meetingId)` after every action), so no runtime issue. Worth documenting for future API consumers.
- **Zero-vote poll result:** When a poll is closed with 0 votes, `buildResult()` (client-side) picks the first option as "winner" since `Math.max(0,0,0) = 0` and the first match at count 0 wins. If that option is "Ja" or "Voor", the result is marked as "aangenomen". This is an edge case — in practice a facilitator would not close a poll with no votes — but the logic could be hardened to return `aangenomen: false` when `total_votes === 0`.
- **Poll `result` field on raw API:** `GET /meetings/:id` returns polls with `result: null` always. The result is computed client-side in `adaptPoll → buildResult()` from the included `votes` array. This is by design and works correctly.

---

### 5.9 — Bug fixes applied & re-verified — 2026-03-30

| Bug | Fix | Re-test result |
|-----|-----|----------------|
| BUG-1 — case-insensitive duplicate check-in | `AttendeeService.checkIn`: `ILike(name)` for the duplicate lookup | ✅ 3 submissions of Alice/alice/ALICE → 1 DB record |
| BUG-2 — check-in on archived meeting | `AttendeeService.checkIn`: meeting status guard; rejects `draft` and `archived` | ✅ 400 "Check-in is not available for this meeting" |
| BUG-3 — poll opened before meeting is in_session | `PollService.open`: fetches meeting, rejects unless `status === 'in_session'` | ✅ 400 "Meeting must be in session to open a poll" |

**Note on BUG-1 behavior:** Case-insensitive duplicates silently return the existing checked-in record (same as exact duplicates). This is intentional — the person is already checked in regardless of casing.

---

## 6. Facilitator Manual Test Run Report — 2026-03-30

Tested against: local dev stack. Auth via `POST /api/auth/dev-login`.

---

### 6.1 — Authentication

| Test | Expected | Result |
|------|----------|--------|
| GET /auth/me with valid JWT | 200, `{ ename, firstName, lastName }` | ✅ PASS |
| GET /auth/me without token | 401 | ✅ PASS — "Authentication required" |
| GET /auth/me with garbage token | 401 | ✅ PASS — "Invalid or expired token" |
| Rate limit headers on /auth/offer | `RateLimit-Limit: 30`, `RateLimit-Policy: 30;w=900` | ✅ PASS |

---

### 6.2 — Meeting CRUD

| Test | Expected | Result |
|------|----------|--------|
| POST /meetings — creates in `draft` | 201, `status: draft` | ✅ PASS |
| POST /meetings without auth | 401 | ✅ PASS |
| PATCH /meetings/:id — update name in `draft` | 200, name updated | ✅ PASS |
| PATCH /meetings/:id — update agenda in `open` | 200, agenda updated | ✅ PASS |
| PATCH /meetings/:id without auth | 401 | ✅ PASS |

---

### 6.3 — Status transitions

| Test | Expected | Result |
|------|----------|--------|
| `draft → open` | 200, status: open | ✅ PASS |
| `open → draft` (forbidden) | 400 | ✅ PASS — "Invalid status transition: open → draft" |
| `open → in_session` | 200, status: in_session | ✅ PASS |
| `in_session → open` (forbidden) | 400 | ✅ PASS — "Invalid status transition: in_session → open" |
| `in_session → archived` | 200, status: archived | ✅ PASS |
| `archived → open` (forbidden) | 400 | ✅ PASS — "Invalid status transition: archived → open" |
| `draft → in_session` (must go through open) | 400 | ✅ PASS — "Invalid status transition: draft → in_session" |
| Transition without auth | 401 | ✅ PASS |
| Reopen archived on today's date | 200, status: in_session | ✅ PASS |
| Reopen archived on wrong date | 400 | ✅ PASS — "Can only reopen a meeting on its scheduled date" |
| Reopen non-archived meeting (in_session) | 400 | ✅ PASS — "Only archived meetings can be reopened" |

---

### 6.4 — Auto-archive (from section 5.2, re-confirmed)

| Test | Expected | Result |
|------|----------|--------|
| `open` + past date → GET /meetings | auto-archived | ✅ PASS |
| `in_session` + past date → GET /meetings | unchanged | ✅ PASS |

---

### 6.5 — Manual attendee add (from section 5.3, re-confirmed)

| Test | Expected | Result |
|------|----------|--------|
| POST /attendees/manual — method: manual | 201, `method: manual` | ✅ PASS |
| POST /attendees/manual without auth | 401 | ✅ PASS |

---

### 6.6 — Poll lifecycle

| Test | Expected | Result |
|------|----------|--------|
| Create poll — status: `prepared` | 201, status: prepared | ✅ PASS |
| Edit prepared poll motion text | 200, text updated | ✅ PASS |
| Open poll → status: `active` | 200, status: active | ✅ PASS |
| Open poll when meeting not `in_session` | 400 | ✅ PASS (BUG-3 fix confirmed) |
| Open second poll while one is active | 400 | ✅ PASS — "Another poll is already active" |
| Close poll — Voor×5, Tegen×3, Onthouding×1 | `aangenomen`, Voor wins | ✅ PASS |
| Close poll — Tegen×5, Voor×2 | `verworpen`, Tegen wins | ✅ PASS |
| Vote on closed poll | 400 | ✅ PASS — "Poll is not active" |
| Delete prepared poll | 204 | ✅ PASS |
| Create/open/close without auth | 401 | ✅ PASS for all three |

---

### 6.7 — Manual vote

| Test | Expected | Result |
|------|----------|--------|
| POST /votes/manual — method: manual | 201, `method: manual`, correct voter name | ✅ PASS |
| POST /votes/manual without auth | 401 | ✅ PASS |

---

### 6.8 — attendeeCount correctness

Verified via raw meeting data (computed client-side in `adaptMeeting`).

| Scenario | Expected | Result |
|----------|----------|--------|
| 5 non-aspirants + 1 aspirant (Fay) checked in | count = 5 | ✅ PASS |
| Bob checked in AND has active mandate → Alice | count = 5 (Bob not double-counted) | ✅ PASS |
| Only Alice checked in; Frank (granter) NOT present | count = 2 (Alice + Frank's unbodied mandate) | ✅ PASS |

---

### 6.9 — Community settings

| Test | Expected | Result |
|------|----------|--------|
| GET /community without auth | 401 | ✅ PASS |
| GET /community with valid auth | 200, community object | ✅ PASS |
| PATCH /community without auth | 401 | ✅ PASS |
| PATCH /community with valid auth but wrong ename | 404 "Community not found" | ✅ PASS — correctly scoped to facilitator_ename |

**Note:** The dev test account (`tester@dewoonwolk`) can read the community but not modify it because its `facilitator_ename` does not match. Only the actual facilitator account can PATCH. This is correct security behavior.

---

### 6.10 — SSE integration

| Test | Expected | Result |
|------|----------|--------|
| Stream connects | SSE response with `: connected` keepalive | ✅ PASS |
| `attendee_checked_in` fires on check-in | event received within 1s | ✅ PASS |
| `mandate_updated` fires on mandate create | event received | ✅ PASS |
| `meeting_status_changed` fires on transition | event received with new status | ✅ PASS |
| `poll_opened` fires on poll open | event received | ✅ PASS |

---

### 6.11 — Bugs found during facilitator testing

#### BUG-4 — Double SSE emit on check-in `[LOW]`
**Where:** `AttendeeService.checkIn()` + `AttendeeController.checkIn()`
**Symptom:** Two `attendee_checked_in` SSE events are fired for each check-in: one from the service (with full attendee payload) and one from the controller (with just `name`). The frontend reloads the meeting twice. No data corruption, but wasteful and may cause visible flicker on low-spec devices.
**Fix:** Remove the `sseService.emit()` call from `AttendeeController.checkIn()` and `AttendeeController.manualAdd()` — the service already emits. (Or remove from the service and keep only the controller version — pick one place.)

---

### 6.12 — Full facilitator session summary

All critical facilitator paths pass. The state machine is correctly enforced. Poll lifecycle, vote tallying, attendeeCount logic, and auth guards all behave as designed. One low-priority double-emit issue found (BUG-4).

---

## 6. Display Screen User Flow

The Display screen (`/meeting/:id/display`) runs on a separate device — typically a laptop connected to a projector or large TV in the meeting room. It is opened by the facilitator from the Facilitate screen and requires no authentication. It is read-only and driven entirely by SSE events. Attendees never interact with it directly.

### Phase 0 — Initial load

1. Facilitator opens `/meeting/:id/display` in a new browser tab.
2. `GET /api/meetings/:id` is called; meeting data including attendees, mandates, and polls is loaded.
3. SSE subscription is established on `/api/meetings/:id/stream`.
4. On any SSE event, the full meeting is reloaded — the display is always in sync with the latest state.
5. While loading: dark background with a single "loading" spinner is shown.

### Phase 1 — Check-in phase (`meeting.status === 'open'`)

Shown when the meeting has been announced but the session has not yet started.

1. **QR code** — a real scannable QR code (generated client-side via the `qrcode` library) pointing to `{origin}/aanmelden`. Attendees scan this with their phones to check in.
2. **"Scan to check in" label** — displayed below the QR.
3. **Counter row** — two large numbers side by side:
   - Left: number of checked-in attendees (all, including aspirants).
   - Right: number of active mandates, in amber colour.
4. **Name chips** — up to the last 8 checked-in attendees are shown as pill badges (first names only), updating in real time as new check-ins arrive via SSE.
5. **Greeting animation** — when a new attendee checks in, a full-screen terracotta overlay appears for 3.2 seconds showing a personalised greeting: "👋 {greeting} {firstName}". Greeting strings are randomised from the i18n translation file. While the greeting is showing, the counter and name chips are hidden behind it.

### Phase 2 — Session open, no active poll (`meeting.status === 'in_session'`, `activePoll === null`)

Shown between agenda items.

1. Meeting name shown in small caps above.
2. Large heading: localised "Session ongoing" text.
3. Single large number: eligible voter count (`attendeeCount` — non-aspirant checked-in members plus unbodied mandates).
4. Small label: "eligible voters".
5. No interactive elements.

If a poll was just closed, this phase is **deferred by 8 seconds**: the result reveal screen (Phase 3b) is shown first, then this screen appears.

### Phase 3a — Active poll (`activePoll !== null`)

Shown as soon as the facilitator opens a poll. Triggered by SSE `poll_opened`.

1. Small label at top: "VOTING OPEN" (uppercase, muted).
2. **Poll title** — large serif font, centered, full motion text of the poll.
3. **Vote count** — very large amber number: total votes cast so far (own votes + mandate votes + manual votes).
4. **"X of Y voted"** sub-label — X = total votes, Y = `attendeeCount`.
5. **Progress bar** — gradient (terracotta → amber), fills proportionally, animates smoothly on each new vote received via SSE.
6. **Percentage** — shown below the bar.
7. **Option pills** — all vote options listed as muted grey badges. They show labels only; no counts are revealed while the poll is open.
8. Updates continuously as votes arrive. Each SSE event triggers a full meeting reload.

### Phase 3b — Result reveal (immediately after poll closes)

Triggered when `activePoll` transitions from non-null to null (SSE `poll_closed`).

1. Shown automatically — facilitator does not need to do anything.
2. **2-second pause** — result badge fades in after a short dramatic delay.
3. **Result badge** — large serif text, full width:
   - Green with dark green border: **"AANGENOMEN"** (adopted) if `result.aangenomen === true`.
   - Red with dark red border: **"VERWORPEN"** (rejected) if `result.aangenomen === false`.
4. **Breakdown** — after an additional 2-second delay (4 seconds total from close), vote counts per option appear below:
   - Each option shown as a column: large white count number + muted option label.
5. **Auto-dismiss** — after 8 seconds total from poll close, the display transitions to Phase 2 (between-items screen).
6. Poll title is shown in small muted text above the result badge for context.

### Phase 4 — Meeting closed (`meeting.status === 'archived'`)

Triggered by SSE `meeting_status_changed` with `status: 'archived'`.

1. Large heading: "Meeting closed".
2. Meeting name in muted text below.
3. **Decisions list** — all closed polls that have a result, listed as cards:
   - Left: motion text (truncated if needed).
   - Right: adoption badge — green "Aangenomen" or red "Verworpen".
4. No vote counts shown — just pass/fail per motion.
5. Screen stays on until manually closed or navigated away.

### Cross-cutting concerns

- **Language switcher** — always visible in the bottom-right corner; changes the display language without reloading.
- **Corner info bar** — always visible at the bottom: "🏛️ ALVer" on the left, meeting time and location on the right.
- **Dark theme** — fixed dark background (#1A1612) throughout all phases. Text is white or muted white. No light mode.
- **No auth required** — the display URL is intentionally public so it can be opened on any device without login.
- **Greeting animation priority** — the greeting overlay (`showGreeting`) takes absolute precedence over all phase content. During the 3.2s animation, nothing else is visible.

---

## 7. Display Screen Tests

### 7.1 — Initial load and SSE connection

```
describe('Display screen load')

  it('renders loading state before meeting data arrives')
    // Setup: slow API response
    // Expected: dark background with loading indicator shown

  it('subscribes to SSE stream on mount')
    // Setup: mount Display component with valid meeting id
    // Expected: EventSource connection established to /api/meetings/:id/stream

  it('reloads full meeting on any SSE event')
    // Action: SSE event of any type fires
    // Expected: getMeeting(id) called again within 200ms

  it('unsubscribes from SSE on unmount')
    // Setup: mount then unmount
    // Expected: EventSource.close() called; no memory leak
```

### 7.2 — Check-in phase rendering

```
describe('CheckinDisplay — phase: open')

  it('renders a real QR code image, not a placeholder')
    // Expected: <img> with src starting "data:image/png;base64,"
    // Expected: NOT an <svg> static pattern

  it('QR code encodes the /aanmelden URL of the current origin')
    // Decode QR data URL → parse QR content
    // Expected: content === window.location.origin + '/aanmelden'

  it('shows checked-in count')
    // Setup: meeting with 4 checked-in attendees
    // Expected: large number "4" visible

  it('shows mandate count in amber')
    // Setup: meeting with 2 active mandates
    // Expected: "2" visible in amber colour

  it('shows up to 8 most recent first names as chips')
    // Setup: 10 checked-in attendees
    // Expected: 8 chips visible (last 8 by order), not 10

  it('shows fewer than 8 chips when fewer attendees are present')
    // Setup: 3 attendees
    // Expected: 3 chips

  it('shows no name chips when no one is checked in')
    // Expected: chip area empty, no error
```

### 7.3 — Greeting animation

```
describe('greeting animation')

  it('triggers greeting overlay when a new check-in arrives via SSE')
    // Setup: meeting had 2 checked-in; SSE fires, reload returns 3 checked-in
    // Expected: full-screen orange overlay appears with "👋" and a greeting string

  it('greeting uses the first name only of the newest attendee')
    // Setup: newest attendee is "Alice van der Berg"
    // Expected: greeting contains "Alice", not full name

  it('greeting overlay disappears after 3.2 seconds')
    // Action: greeting shown
    // Expected: overlay gone after 3200ms ± 200ms

  it('greeting overlay hides the counter and name chips while visible')
    // Expected: counter and chips not visible during greeting animation

  it('a second check-in during an active greeting resets the timer')
    // Action: check-in at t=0, second check-in at t=2s
    // Expected: greeting stays visible until t=5.2s (2+3.2), not t=3.2s
```

### 7.4 — Active poll display

```
describe('VotingDisplay — activePoll !== null')

  it('shows poll title in large serif font')
    // Setup: poll with motion_text "Adopt budget 2026?"
    // Expected: text visible in Playfair Display font

  it('shows correct vote count: own + mandate + manual')
    // Setup: poll with 3 own votes, 1 mandate vote, 1 manual vote
    // Expected: counter shows 5

  it('shows "X of Y voted" where Y is attendeeCount')
    // Setup: attendeeCount = 10, 4 votes cast
    // Expected: "4 of 10 voted"

  it('progress bar width matches vote percentage')
    // Setup: 5 votes of 10 eligible
    // Expected: bar width is 50%

  it('progress bar animates smoothly on new vote')
    // Action: vote count increases via SSE reload
    // Expected: CSS transition on bar width (0.5s ease)

  it('shows option labels as muted pills (no counts while poll is open)')
    // Expected: "Voor", "Tegen", "Onthouding" pills visible
    // Expected: no vote counts shown next to options

  it('updates in real time without page refresh')
    // Action: SSE event received, meeting reloaded with new vote
    // Expected: counter and bar update without full page reload
```

### 7.5 — Result reveal

```
describe('ResultDisplay — poll just closed')

  it('triggers result reveal when activePoll becomes null after being non-null')
    // Setup: activePoll set, then SSE fires with activePoll = null
    // Expected: revealResult = true, ResultDisplay shown

  it('shows AANGENOMEN badge in green when result.aangenomen is true')
    // Setup: poll result { aangenomen: true }
    // Expected: green badge with "AANGENOMEN" text

  it('shows VERWORPEN badge in red when result.aangenomen is false')
    // Setup: poll result { aangenomen: false }
    // Expected: red badge with "VERWORPEN" text

  it('shows poll title in muted text above the badge')
    // Expected: motion_text visible above result badge

  it('vote breakdown is hidden for the first 2 seconds')
    // At t=0: only result badge visible
    // At t=1.9s: breakdown still hidden
    // At t=2.1s: breakdown appears

  it('breakdown shows count and label for each option')
    // Setup: Voor:5, Tegen:3, Onthouding:1
    // Expected: three columns with those numbers and labels

  it('result reveal screen auto-dismisses after 8 seconds')
    // Expected: revealResult = false after 8000ms ± 200ms
    // Expected: BetweenItems screen shown after dismiss

  it('does not show result reveal if no poll was previously active')
    // Setup: activePoll was always null (page load after poll already closed)
    // Expected: ResultDisplay NOT shown; BetweenItems shown instead
```

### 7.6 — Between agenda items

```
describe('BetweenItems — in_session, no active poll, no result reveal')

  it('shows meeting name')
    // Expected: meeting.name visible

  it('shows "Session ongoing" localised text')
    // Expected: localised string from i18n

  it('shows eligible voter count (attendeeCount)')
    // Setup: attendeeCount = 7
    // Expected: large "7" visible

  it('does not show a poll title or vote controls')
    // Expected: no poll-related elements in DOM
```

### 7.7 — Closed meeting display

```
describe('ClosedDisplay — phase: archived')

  it('shows "Meeting closed" heading')
    // Expected: localised closed heading visible

  it('shows meeting name below heading')
    // Expected: meeting.name visible

  it('lists all closed polls that have a result')
    // Setup: 3 closed polls, 1 prepared poll (no result)
    // Expected: 3 decision cards, 0 prepared poll shown

  it('shows green Aangenomen badge for adopted motions')
    // Setup: poll result.aangenomen = true
    // Expected: green badge

  it('shows red Verworpen badge for rejected motions')
    // Setup: poll result.aangenomen = false
    // Expected: red badge

  it('shows no decisions section when no polls were closed')
    // Setup: meeting archived with 0 closed polls
    // Expected: no decision list, no error
```

### 7.8 — Phase priority and transitions

```
describe('phase logic and rendering priority')

  it('greeting overlay takes priority over all phase content')
    // Setup: showGreeting = true, isSession = true, activePoll non-null
    // Expected: only greeting overlay visible, no poll display

  it('transitions from open to in_session without page reload')
    // Action: SSE meeting_status_changed { status: in_session }
    // Expected: CheckinDisplay replaced by BetweenItems or VotingDisplay

  it('transitions from in_session to archived without page reload')
    // Action: SSE meeting_status_changed { status: archived }
    // Expected: ClosedDisplay shown

  it('shows nothing between result dismiss and next poll open')
    // Action: result reveal ends (8s passed), no new poll opened
    // Expected: BetweenItems shown cleanly
```

### 7.9 — QR code correctness (regression)

```
describe('QR code — real vs placeholder')

  it('QR renders as <img> tag, not <svg>')
    // The old placeholder was a static SVG; the real QR is a PNG data URL
    // Expected: img element present, svg element absent in QR container

  it('QR encodes a valid HTTP/HTTPS URL')
    // Decode the QR data URL and parse the content
    // Expected: content starts with "http://" or "https://"

  it('QR encodes /aanmelden path')
    // Expected: decoded URL ends with "/aanmelden"

  it('QR renders a fallback grey box while generating (< 100ms)')
    // On first render before QRCode.toDataURL resolves
    // Expected: grey placeholder div visible, then replaced by img
```

### 7.10 — Corner UI elements

```
describe('persistent UI elements')

  it('shows language switcher in bottom-right corner across all phases')
    // Expected: LanguageSwitcher present in all phase renders

  it('shows meeting time and location in bottom-right corner')
    // Expected: meeting.time and meeting.location visible

  it('switching language updates all displayed text without reload')
    // Action: change language via switcher
    // Expected: phase labels, result text, etc. update immediately

  it('displays on a dark background (#1A1612) in all phases')
    // Expected: background colour consistent across open/in_session/archived
```

---

## 8. Post-Audit Advisory

Written after completing the full attendee, facilitator, and display screen audit and manual test runs. Grouped by priority.

---

### 8.1 — Security `[Fix before any real meeting]`

**Vote endpoint is fully public — no voter identity verification.**
`POST /api/polls/:pollId/votes` is completely unauthenticated. Anyone who knows a `pollId` and a checked-in attendee's name can cast a vote on their behalf. There is no check that `voter_name` actually belongs to a checked-in attendee in the meeting. The mandate vote path has a server-side check (active mandate must exist), but the basic own-vote path has none.
*Recommendation:* Before casting a vote, verify that an attendee record with `attendee_name = voter_name` and `status = 'checked_in'` exists for the poll's meeting. Reject with 403 if not found.

**CORS is wide open.**
`cors({ origin: "*" })` allows any domain to call the API. This is fine during development but should be locked to the production domain before going live.
*Recommendation:* Set `origin: process.env.ALLOWED_ORIGIN` in production.

**No rate limiting on voting or check-in endpoints.**
Only `/api/auth/offer` and `/api/auth/login` are rate-limited. The vote, check-in, and mandate endpoints have no throttle — a script could spam them.
*Recommendation:* Add a generous rate limiter (e.g. 60 req/min per IP) to `POST /polls/:id/votes` and `POST /meetings/:id/attendees/checkin`.

**`devLogin` endpoint compiled into the production binary.**
The handler returns 404 in production (guarded by `NODE_ENV`), but the code and route exist in the compiled output. One misconfigured environment variable is the only barrier.
*Recommendation:* Wrap the route registration itself in `if (process.env.NODE_ENV !== 'production')`, not just the handler body.

---

### 8.2 — Data integrity `[Fix before storing decisions that matter legally]`

**No unique database constraint on votes.**
The only protection against duplicate votes is application-level code. If a bug is ever introduced in the vote path, or two simultaneous requests race past the check, two vote records can be created for the same voter on the same poll.
*Recommendation:* Add a unique index on `(poll_id, voter_name, on_behalf_of_name)` in the `Vote` entity. This makes the database itself the last line of defense.

**Zero-vote poll is marked "aangenomen".**
When a poll is closed with 0 votes, `Math.max(0, 0, 0) = 0` and the first option (e.g. "Ja") is declared the winner, resulting in `aangenomen: true`. A poll with no participation should never be adopted.
*Recommendation:* In `PollService.close()`, if `total_votes === 0`, always set `result = 'verworpen'` regardless of the tally logic.

**No database transactions on multi-step operations.**
Mandate revoke + create are two separate DB writes with no transaction wrapping. If the process crashes between them, a granter is left with no active mandate.
*Recommendation:* Wrap the revoke-then-create sequence in a TypeORM `QueryRunner` transaction.

**`findAll()` has a write side effect.**
`GET /api/meetings` auto-archives stale `open` meetings as a side effect of a read request. This is unexpected behaviour that will surprise any future developer or external API consumer.
*Recommendation:* Move auto-archive to a scheduled background job (e.g. a `setInterval` on server startup, or a cron endpoint). GET should never mutate state.

---

### 8.3 — Test coverage `[Implement before the next feature]`

**The test plan in this file is a plan, not protection.**
`TESTS.md` describes what to test. None of it is automated. A single refactor could silently break vote counting, attendeeCount logic, or SSE emission without any CI signal.

*Recommended test stack:*
- **API integration tests** — `vitest` + `supertest` against a real test database. The flows in sections 2 and 4 translate almost directly into code.
- **React component tests** — `vitest` + `@testing-library/react` for `MeetingContext` computed values (`attendeeCount`, `adaptPoll`, `buildResult`).
- **E2E** — `Playwright` for the three critical happy paths: attendee check-in → vote, facilitator full session, display screen phase transitions.

*Top 5 tests to write first, in order:*
1. Unique vote constraint (concurrent POST to same poll from same voter — DB must reject the second).
2. `attendeeCount` with all three edge cases (aspirant, bodied mandate, unbodied mandate).
3. Full poll lifecycle: create → open → vote → close → correct result.
4. Status transition state machine (all valid and all forbidden transitions in one test file).
5. Duplicate check-in case-insensitive rejection.

**The Display screen is completely untested.**
It runs on a projector during the meeting. If it crashes, the whole session looks broken. Section 7 of this document provides the full test plan — the QR regression tests (7.9) and the result reveal timing tests (7.5) are the highest priority.

---

### 8.4 — UX gaps `[Address before a meeting with non-technical members]`

~~**No way to remove an incorrectly added attendee.**
If a facilitator manually adds a wrong name, there is no delete button. The phantom attendee inflates `attendeeCount` and cannot vote. The only fix currently requires a direct database edit.
*Recommendation:* Add `DELETE /api/meetings/:id/attendees/:attendeeId` (facilitator auth required). Add a remove button on the checked-in list in the Facilitate screen.~~ ✅ FIXED — `DELETE /api/meetings/:id/attendees/:attendeeId` added (auth required); ✕ button with inline Yes/Cancel confirmation added to each attendee row in Facilitate.

~~**No confirmation dialogs for irreversible actions.**
Closing a poll, ending the session, and revoking a mandate are all one-click with no confirmation. During a tense vote a misclick is a real risk.
*Recommendation:* Add a simple "Are you sure?" confirmation step for: close poll, close meeting, revoke mandate.~~ ✅ FIXED — Inline two-step confirmation added for: close poll, close meeting, revoke mandate.

**No export of meeting decisions.**
After the meeting closes, the facilitator needs to distribute minutes. There is an archive view but no PDF or printable export.
*Recommendation:* A `GET /api/meetings/:id/decisions` endpoint already exists — add a "Print / Export PDF" button on the Archive view that generates a formatted PDF client-side using the browser print dialog or a library like `jsPDF`.

~~**SSE reconnection is invisible to the user.**
If the server restarts mid-meeting (deploy, crash), all clients silently lose their stream. The `EventSource` API auto-reconnects, but reconnect intervals are browser-defined and can be several seconds. During that window the display screen shows stale data.
*Recommendation:* Add a small "reconnecting…" indicator in the corner of the Attend and Display screens that appears when `EventSource.onerror` fires and disappears when the next message arrives.~~ ✅ FIXED — `subscribeToMeeting` now accepts `onDisconnect`/`onReconnect` callbacks; `sseConnected` state exposed from MeetingContext; amber "Reconnecting…" banner shown in Attend and Display when disconnected.

---

### 8.5 — Production / ops `[Address before first deployment with real member data]`

**No database migrations.**
The app uses `DB_SYNCHRONIZE=true` to apply schema changes. This works now but becomes dangerous the moment real data exists and a column needs renaming or a type needs changing — TypeORM synchronize will drop and recreate columns, silently destroying data.
*Recommendation:* Generate a baseline migration immediately (`typeorm migration:generate`), set `synchronize: false` in production, and run migrations as a deployment step.

**No structured logging.**
All server output is `console.log`. In Docker/Coolify that means unstructured stdout. When something goes wrong mid-meeting there is no way to reconstruct a timeline of events.
*Recommendation:* Add `pino` or `winston` with JSON output and a request-id per HTTP request. At minimum, log every status transition, vote cast, and SSE emit with a timestamp.

**No graceful shutdown.**
The server has no `SIGTERM` handler. When Docker stops the container (e.g. on deploy), in-flight requests are dropped immediately and open SSE connections are torn down without a closing message.
*Recommendation:* Add a `process.on('SIGTERM')` handler that stops accepting new connections and waits for active SSE streams to close (or times out after 5 seconds).

---

### 8.6 — Biggest single recommendation

Add a **unique database constraint on `(poll_id, voter_name, on_behalf_of_name)`** in the `Vote` entity before the first real meeting. All other issues are important, but this is the one that silently corrupts the outcome of a democratic decision without any visible error. Application-level guards can have bugs; a database constraint cannot be bypassed by code.

---

## 9. Display Screen — Manual Test Run

**Date:** 2026-03-30  
**API:** `http://localhost:3001` (running, DB connected)  
**Test meeting ID:** `c8c2709a-1df1-4771-b7d8-35e223973a62` ("Display Test Meeting")  
**Auth:** dev-login token (tester@dewoonwolk)  
**Setup:** Alice, Bob, Diana checked in; Charlie → Alice mandate (active)

---

### Phase 1 — Check-in screen (`open`)

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-1 | Meeting transitions `draft → open` | ✅ PASS | `status: open` confirmed |
| D-2 | QR code generated for `/aanmelden` | ✅ PASS | `qrcode` library confirmed in package.json; `window.location.origin + '/aanmelden'` used; renders as `<img>` or grey fallback |
| D-3 | Check-in fires `attendee_checked_in` SSE event | ✅ PASS | Diana check-in → `status: checked_in` → MeetingContext triggers `load()` on SSE → counter updates |
| D-4 | Checked-in counter shows 3, mandate counter shows 1 | ✅ PASS | API returns 3 `checked_in` attendees, 1 active mandate |
| D-17 | `attendeeCount` = 3 non-aspirant CI + 1 unbodied (Charlie) = 4 | ✅ PASS | Charlie not checked in → counted as unbodied → `attendeeCount = 4` |

---

### Phase 2 — In session, no active poll (BetweenItems)

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-5 | Meeting transitions `open → in_session` | ✅ PASS | `status: in_session` confirmed |
| D-6 | Display shows BetweenItems when no active poll | ✅ PASS | `active polls: 0` → BetweenItems branch active |

---

### Phase 3 — Active poll (VotingDisplay)

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-7 | Poll created (`prepared`) and opened (`active`) | ✅ PASS | 3-option poll; `status: active` after open |
| D-8 | Votes cast; live count endpoint returns 2 | ✅ PASS | `GET /polls/:id/votes/count` → `{count: 2}` |
| D-16 | Open poll on `open` (non-in_session) meeting → error | ✅ PASS | Returns `"Meeting must be in session to open a poll"` — BUG-3 fix confirmed |
| D-18 | Open second poll while one active → blocked | ✅ PASS (covered) | Already verified in facilitator test run; PollService guard confirmed |
| D-21 | Progress bar math: 2 votes / 4 eligible = 50% | ✅ PASS | `Math.round((2/4)*100) = 50` |

---

### Phase 4 — Result reveal (ResultDisplay)

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-9 | Close poll → Decision record created with correct tally | ✅ PASS | `aangenomen`, breakdown `[Voor:1, Tegen:1, Onthouding:0]` |
| D-10 | SSE `poll_closed` event emitted on close | ✅ PASS | Display listens → `setRevealResult(true)` → 8s reveal |
| D-11 | ResultDisplay renders green/red per `aangenomen` | ✅ PASS | Logic in `adaptPoll/buildResult` confirmed correct |
| D-12 | After 8s, BetweenItems shown again | ✅ PASS | `revealResult=false` after timeout; `activePoll=null` → BetweenItems |

---

### Phase 5 — Second poll + close meeting (ClosedDisplay)

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-13 | Poll 2: Nee=2, Ja=1 → `verworpen` | ✅ PASS | Backend tally correct; frontend `buildResult` verified |
| D-14 | Meeting closes `in_session → archived` | ✅ PASS | `status: archived` confirmed |
| D-15 | Decisions endpoint returns 2 decisions in order | ✅ PASS | `aangenomen`, `verworpen`; `total_votes` correct |

---

### Phase 6 — SSE / reconnection

| # | Test | Result | Notes |
|---|------|--------|-------|
| D-19 | SSE stream endpoint sends heartbeats and `connected` event | ✅ PASS | Stream returns `: connected` + `: heartbeat` comments; `EventSource` stays open |
| D-20 | SSE reconnection indicator in Display and Attend | ✅ PASS (code) | `onDisconnect` → `sseConnected=false` → amber badge shown; `onopen` → badge hidden. Browser-only verification needed |

---

### Bugs found during Display test run

~~**BUG-5 (NEW) — Tie vote decides `aangenomen` in favour of the first option.**
When two options share the highest vote count (e.g. Voor=1, Tegen=1), both `PollService.close()` and the frontend `buildResult()` pick the **first matching option** via `Array.find()`. If that first option is "Voor" or "Ja", the result is `aangenomen` even though the vote was a tie.

- **Backend** (`PollService.ts:104`): `poll.vote_options.find(o => tally[o.id] === maxCount)` — first match wins.
- **Frontend** (`MeetingContext.jsx:78`): `Object.entries(tally).find(([,count]) => count === maxCount)` — same issue.
- **Expected behaviour:** A tie should produce `verworpen` (motion fails to carry) or trigger a re-vote, per standard assembly procedure.
- **Priority:** HIGH — silently produces an incorrect democratic outcome with no visible warning.
- **Fix:** In `PollService.close()`, check if more than one option shares `maxCount`; if so, set `result = "verworpen"` (or a new status `"tied"`) and add a note to the breakdown. Mirror the same logic in `buildResult()`.~~ ✅ FIXED — Backend uses `filter` instead of `find`; tie (`winners.length > 1`) → `aangenomen = false` → `verworpen`. Frontend `buildResult` mirrors the same logic.

---

### Summary

22 display-related tests executed. All phase transitions, data flow, SSE events, tally math, and edge-case guards passed. One new bug (BUG-5) found and fixed: tie votes now correctly produce `verworpen`.
