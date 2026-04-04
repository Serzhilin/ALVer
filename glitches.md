# ALVer — Code Audit Findings

## CRITICAL

~~**1. Vote fraud via mandates** — `VoteController.ts`~~ ✅ FIXED
~~The API accepts `on_behalf_of_name` (proxy vote) without verifying that the voter actually holds an active mandate from that person. Any attendee can vote on behalf of anyone else.~~
Fixed in `VoteService.ts`: when `on_behalf_of_name` is present, verifies an active mandate exists with matching `proxy_name` + `granter_name` for this meeting.

~~**2. Mandate voting broken in frontend** — `Attend.jsx`~~ ✅ FIXED
~~The vote handler constructs `voter_name + '_proxy'` but never sends `on_behalf_of_name` to the API. Mandate votes are structurally incorrect — the granter is never recorded.~~
Fixed in `Attend.jsx`: `handleVote` now passes `myName` (not `myName + '_proxy'`) as `voter_name`; `on_behalf_of_name` carries the granter's name.

~~**3. SSE only fires on status transitions** — `MeetingService.ts`~~ ✅ FIXED
~~`addPoll()`, `updateMeeting()`, etc. don't call `sseService.emit()`. When facilitator adds a poll, attendees don't see it until the app refreshes or a status change fires.~~
Added SSE emit in: `PollService.create` (`poll_added`), `AttendeeController.checkIn/manualAdd` (`attendee_checked_in`), `MandateController.create/revoke` (`mandate_updated`). Poll open/close already had SSE.

~~**4. `'closed'` status doesn't exist but is used** — `Display.jsx` + `Meeting.ts`~~ ✅ FIXED
~~`Display.jsx` checks `phase === 'closed'` which can never happen. The `ClosedDisplay` was already reachable via `phase === 'archived'`.~~
Removed dead `phase === 'closed'` check. `isClosed` now simply `phase === 'archived'`.

~~**5. Auto-archive silently mid-meeting** — `MeetingService.ts`~~ ✅ FIXED
~~`findAll()` archives `in_session` meetings whose date has passed, potentially killing a running meeting.~~
Auto-archive now only applies to `open` (announced, not started) meetings. `in_session` meetings must be explicitly closed by the facilitator.

~~**6. Mandate granted to aspirants** — `Register.jsx` + `MandateController.ts`~~ ✅ FIXED
~~No validation that the proxy isn't an aspirant. Aspirants can't vote, so a mandate granted to one is invalid, but the app silently accepts it.~~
Frontend was already filtering aspirants from the dropdown (`MeetingController.getMembers` filters `!is_aspirant`). Added backend guard in `MandateService.create()`: looks up proxy by name, throws if `is_aspirant === true`.

---

## MEDIUM

~~**7. Previous user's name persists after logout** — `UserContext.jsx`~~ ✅ FIXED
`logout()` now also calls `localStorage.removeItem('alver_my_name')`.

~~**8. Auto check-in race condition** — `Attend.jsx`~~ ✅ FIXED
eID effect now clears `alver_my_name` from localStorage immediately on entry, preventing Effect 1 (name-based) from racing with it. Also moved `setCheckedIn(true)` inside `.then()` so the UI only shows "checked in" after the API call confirms — this also resolves issue 9.

~~**9. Auto check-in swallows backend failure** — `Attend.jsx`~~ ✅ FIXED
~~`checkIn(name).catch(err => console.warn(...))` — if check-in fails on the server, the user's UI shows them as checked in but they have no attendee record in the DB.~~
Resolved as part of issue 8 fix: `setCheckedIn(true)` is now inside `.then()`, so it only fires on API success.

~~**10. `attendeeCount` double-counts when granter is also present** — `MeetingContext.jsx`~~ ✅ FIXED
If a mandate granter checks in without revoking their mandate, they were counted twice (once as present, once as mandate). Fixed: mandates are now filtered to only count grantors who are NOT in the checked-in list.

~~**11. Invalid status transition allowed: `open → draft`** — `MeetingService.ts`~~ ✅ FIXED
Removed `"draft"` from the allowed transitions for `"open"`. A meeting can no longer be un-announced.

~~**12. Poll option labels not validated** — `Facilitate.jsx`~~ ✅ FIXED
`handleSaveNewPoll` now trims and filters blank options before saving. The Save button is disabled if fewer than 2 non-empty options exist.

---

## LOW

~~**13. `FacilitatorHeader` `defaultTitle` flash** — `FacilitatorHeader.jsx`~~ ✅ REVIEWED
When `community` is null, shows 'ALVer' — no blank flash. Audit finding was incorrect; no fix needed.

~~**14. `resetToDefault()` dead code** — `MeetingContext.jsx`~~ ✅ FIXED
Removed `resetToDefault()` function definition and its export from the context value object.

~~**15. `'closed'` in Meeting entity enum but not in type** — `Meeting.ts`~~ ✅ FIXED
Added `"closed"` to `MeetingStatus` type with a comment clarifying it is a legacy value not used in transitions.

~~**16. `Aanmelden.jsx` not fully audited** — separate pre-registration flow, worth checking if it's actively used or a leftover.~~ ✅ REVIEWED
Clean redirect-only page: routes to open meeting, shows "closed" for in_session, "none" otherwise. No bugs found.

~~**17. No rate limiting on auth endpoints** — `index.ts`~~ ✅ FIXED
Installed `express-rate-limit`. `/api/auth/offer` and `/api/auth/login` now limited to 30 requests per 15 minutes.

~~**18. Google Fonts injected with unvalidated font name** — `CommunityContext.jsx`~~ ✅ FIXED
CSS variable now strips quotes and backslashes from font name: `font.replace(/['"\\]/g, '')`. URL was already safe via `encodeURIComponent`.

---

## Priority fixes (in order of urgency for a real meeting)

1. ~~Fix mandate voting in `Attend.jsx` — it's broken today~~ ✅
2. ~~Fix `Display.jsx` closed state — display screen never shows final results~~ ✅
3. ~~Add SSE emit to `addPoll()` — attendees miss new polls~~ ✅
4. ~~Clear `alver_my_name` on logout — shared device safety~~ ✅
5. ~~Guard auto-archive — don't archive while `in_session`~~ ✅
