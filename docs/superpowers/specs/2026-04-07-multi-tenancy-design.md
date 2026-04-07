# ALVer Multi-Tenancy — Design Spec

**Date:** 2026-04-07
**Scope:** Allow a user with one eID to belong to multiple communities and pick which one to enter after login. One community active at a time per session.

---

## Problem

The current auth flow assumes one ename maps to exactly one community. `getMe()` returns the first match. A user who is a member of both De Woonwolk and MetaState will always land in whichever community is found first — with no way to switch.

---

## Solution

Community selection happens after JWT issuance, stored in `localStorage` as `alver_community_id`. The JWT stays unchanged (`{ userId, ename }`). Community context is resolved on the client using the stored ID.

---

## Auth Flow (updated)

1. User authenticates via eID — JWT issued as today, stored in `localStorage.alver_token`
2. App calls `GET /api/auth/communities` (new) — returns all communities the user belongs to
3. **If 1 community** → auto-select it, store `alver_community_id`, proceed as today
4. **If >1 community** → show `CommunityPicker` screen with each community's name, logo, and accent color
5. User picks → `alver_community_id` stored in localStorage → app loads with that community's branding and context

---

## Switching Community

- A **"Switch community"** button appears in the app header, but only if the user belongs to >1 community
- Clicking it clears `alver_community_id` and re-shows the `CommunityPicker`
- No logout required — JWT is still valid

---

## Backend Changes

### New endpoint: `GET /api/auth/communities`

Returns all communities the authenticated user belongs to (as member or facilitator).

**Auth:** requires JWT

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "De Woonwolk",
    "slug": "dewoonwolk",
    "logo_url": "...",
    "primary_color": "#C4622D",
    "title_font": "Playfair Display",
    "isFacilitator": true
  },
  {
    "id": "uuid",
    "name": "MetaState",
    "slug": "metastate",
    "logo_url": null,
    "primary_color": "#1A1A2E",
    "title_font": "Inter",
    "isFacilitator": false
  }
]
```

Implementation: query `members` joined with `communities` WHERE `members.ename = user.ename`.

### Modified endpoint: `GET /api/auth/me`

Accepts an optional `?communityId=uuid` query param. When provided, scopes the response to that community (finds the correct Member row). If omitted, falls back to current behaviour (first match) for backwards compatibility.

---

## Frontend Changes

### localStorage

| Key | Value | When set |
|-----|-------|----------|
| `alver_token` | JWT string | On login (unchanged) |
| `alver_community_id` | Community UUID | After picker selection or auto-select |

### New component: `CommunityPicker`

Shown post-login when user belongs to >1 community. Displays a list of community cards — each showing logo (or placeholder), name, accent color swatch, and role (Facilitator / Member). Clicking a card stores `alver_community_id` and continues into the app.

### `UserContext` changes

- After JWT is stored, call `GET /api/auth/communities`
- If 1 result → auto-select, store ID, call `getMe(?communityId=...)`
- If >1 results → store community list in context, render `CommunityPicker`
- Expose `communityCount` and `switchCommunity()` function in context

### `getMe()` call

Updated to pass `?communityId=<alver_community_id>` so the server returns the correct Member row and isFacilitator status for the selected community.

### Header: Switch community button

Rendered only when `communityCount > 1`. Calls `switchCommunity()` which clears `alver_community_id` and triggers the picker to re-appear.

---

## What Does NOT Change

- JWT shape — still `{ userId, ename }`
- JWT expiry (30 days)
- eID login / SSE / deeplink flow
- `CommunityContext` branding logic — it already applies colors/fonts from the loaded community
- All meeting, poll, vote, decision API calls — they use meeting/poll IDs, not community IDs directly

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| User belongs to 0 communities | Show "you are not a member of any community" message |
| `alver_community_id` in localStorage but community was removed | `getMe()` returns 404 → clear stored ID, re-show picker |
| User added to a second community while logged in | Picker only appears on next login or after manual switch |

---

## Files Changed

| File | Change |
|------|--------|
| `api/src/controllers/AuthController.ts` | Add `GET /api/auth/communities` endpoint; update `getMe` to accept `?communityId` |
| `api/src/routes/auth.ts` | Register new route |
| `app/src/context/UserContext.jsx` | Add community selection logic, `communityCount`, `switchCommunity()` |
| `app/src/components/CommunityPicker.jsx` | New component — community selection screen |
| `app/src/components/AppHeader.jsx` | Add conditional "Switch community" button |
