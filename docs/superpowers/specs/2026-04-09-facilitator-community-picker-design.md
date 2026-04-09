# Facilitator Community Picker — Design Spec
_2026-04-09_

## Overview

Fix the community picker so that a facilitator session only ever shows and auto-selects communities where the user is actually a facilitator. Eliminates the Android Firefox bug where picking a community silently resulted in an attendee session.

---

## Root Cause

`getCommunities()` returns all communities the user belongs to (as member or facilitator). The current picker shows all of them with an optional "facilitator" label — meaning a facilitator could pick a community they're only a member of and land as an attendee with no warning.

Additionally, `resolveSession` uses the stored `alver_community_id` without checking whether it's a community where the user is actually a facilitator, so a stale communityId from a previous attendee session silently breaks facilitator login on reload.

---

## Changes

### `app/src/context/UserContext.jsx` — `resolveSession`

When `forceAttendee = false` (facilitator login path):
- Filter `allCommunities` to `facilitatorCommunities = allCommunities.filter(c => c.isFacilitator)`
- Use `facilitatorCommunities` for auto-selection logic:
  - **0 facilitator communities** → set `isFacilitator = false`, leave `communityId = null` (picker gate will show error)
  - **1 facilitator community** → auto-select it, call `getMe(id)`, set `isFacilitator = true`
  - **2+ facilitator communities, valid stored id among them** → auto-select stored, set `isFacilitator = true`
  - **2+ facilitator communities, no valid stored** → leave `communityId = null`, picker shown

"Valid stored" means: `facilitatorCommunities.find(c => c.id === storedId)` — must be in the facilitator-filtered list, not just any community.

Attendee path (`forceAttendee = true`): no change, all communities as today.

---

### `app/src/App.jsx` — `CommunityPickerGate`

When `isFacilitatorSession = true`:
- Compute `pickerCommunities = communities.filter(c => c.isFacilitator)`
- If `pickerCommunities.length === 0` → show error state (see below)
- Pass `pickerCommunities` (not `communities`) to `CommunityPicker`

When `isFacilitatorSession = false`: pass `communities` as today.

---

### `app/src/components/CommunityPicker.jsx`

**Facilitator picker (`isFacilitatorSession = true`):**
- Title: "Je bent facilitator van meerdere communities" (nl) / "You are a facilitator of multiple communities" (en)
- Subtitle: removed — it was "Choose your community", now redundant
- No "facilitator" badge under each entry — every listed community is one where the user is facilitator, so the label adds nothing
- Error state when list is empty (see below)

**Attendee picker (`isFacilitatorSession = false`):**
- Unchanged — title, subtitle, all communities shown as today

**Empty facilitator list error state:**
```
"Je hebt geen facilitatorrechten in een community."
[← Terug naar attendee login]
```
English: "You don't have facilitator rights in any community."
Link goes to `/` (attendee home).

---

### `app/src/locales/nl.json` + `en.json`

Add under `community_picker`:
```json
"facilitator_title": "Je bent facilitator van meerdere communities",
"no_facilitator_communities": "Je hebt geen facilitatorrechten in een community.",
"back_to_attendee": "← Terug naar attendee login"
```
```json
"facilitator_title": "You are a facilitator of multiple communities",
"no_facilitator_communities": "You don't have facilitator rights in any community.",
"back_to_attendee": "← Back to attendee login"
```

Remove `role_facilitator` key (no longer needed).

---

## What Does NOT Change

- `getCommunities()` API endpoint — still returns all communities with `isFacilitator` per entry
- `selectCommunity` — unchanged, still checks `me.isFacilitator` as a safe backstop
- Attendee login flow — entirely unaffected
- Everything else in UserContext

---

## Edge Cases Covered

| Case | Behaviour |
|---|---|
| Facilitator of 0 communities | Error screen shown, link to attendee login |
| Facilitator of 1 community | Auto-selected, no picker shown |
| Stale stored communityId from attendee session | Ignored — not in facilitator-filtered list |
| Reload with `alver_facilitator_mode=true` | Uses filtered list for stored-id validation |
| Picker shown, user picks non-facilitator community | Impossible — filtered list only contains facilitator communities |
