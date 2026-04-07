# ALVer Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a user with one eID to belong to multiple communities, pick which one to enter after login, and switch between them without re-authenticating.

**Architecture:** Community selection happens post-JWT, stored in `localStorage.alver_community_id`. A new `GET /api/auth/communities` endpoint returns all communities for the logged-in user. `UserContext` drives the picker: if >1 community and none selected, it renders `CommunityPicker` instead of the normal app. All community-scoped API calls pass `?communityId` as a query param.

**Tech Stack:** Express + TypeScript (API), React + JSX (frontend), i18next for translations, localStorage for session persistence.

**Spec:** `docs/superpowers/specs/2026-04-07-multi-tenancy-design.md`

---

## File Map

| File | Change |
|------|--------|
| `api/src/services/CommunityService.ts` | Add `findAllByEname` method |
| `api/src/controllers/AuthController.ts` | Add `getMyCommunities`, update `getMe` to accept `?communityId` |
| `api/src/controllers/CommunityController.ts` | Update `get` to accept `?communityId` |
| `api/src/controllers/MeetingController.ts` | Update `list` to accept `?communityId` and fall back to member community |
| `api/src/index.ts` | Register `GET /api/auth/communities` route |
| `app/src/api/client.js` | Add `getCommunities()`, update `getMe()`, `getCommunity()`, `getAllMeetings()` to accept communityId |
| `app/src/context/UserContext.jsx` | Full rewrite: multi-community state, `selectCommunity`, `switchCommunity` |
| `app/src/context/CommunityContext.jsx` | Pass `communityId` from UserContext to API calls |
| `app/src/components/CommunityPicker.jsx` | New component — full-screen community selection |
| `app/src/App.jsx` | Add `CommunityPickerGate` wrapper inside BrowserRouter |
| `app/src/components/AppHeader.jsx` | Add `onSwitchCommunity` prop + menu item |
| `app/src/components/FacilitatorHeader.jsx` | Pass `switchCommunity` from UserContext |
| `app/src/views/Home.jsx` | Pass `communityId` to `getAllMeetings`, pass `switchCommunity` to AppHeader |
| `app/src/locales/en.json` | Add `community_picker` section |
| `app/src/locales/nl.json` | Add `community_picker` section |

---

### Task 1: Backend — `GET /api/auth/communities` + update `getMe`

**Files:**
- Modify: `api/src/services/CommunityService.ts`
- Modify: `api/src/controllers/AuthController.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Add `findAllByEname` to CommunityService**

In `api/src/services/CommunityService.ts`, add after the `findByMemberEname` method (around line 64):

```ts
/** Returns all communities a user belongs to (as facilitator or member), deduped */
async findAllByEname(ename: string): Promise<{ community: Community; isFacilitator: boolean }[]> {
    const results: { community: Community; isFacilitator: boolean }[] = [];
    const seen = new Set<string>();

    // Communities where user is the designated facilitator
    const facilitatorCommunities = await this.repo.find({ where: { facilitator_ename: ename } });
    for (const c of facilitatorCommunities) {
        results.push({ community: c, isFacilitator: true });
        seen.add(c.id);
    }

    // Communities where user has a member row
    const members = await this.memberRepo.find({ where: { ename } });
    for (const m of members) {
        if (!seen.has(m.community_id)) {
            const community = await this.repo.findOne({ where: { id: m.community_id } });
            if (community) {
                results.push({ community, isFacilitator: m.is_facilitator });
                seen.add(m.community_id);
            }
        }
    }

    return results;
}
```

- [ ] **Step 2: Add `getMyCommunities` to AuthController**

In `api/src/controllers/AuthController.ts`, add before the final closing line:

```ts
/** GET /api/auth/communities
 *  Returns all communities the authenticated user belongs to.
 */
export async function getMyCommunities(req: Request, res: Response) {
    const { ename } = req.user!;
    if (!ename) { res.json([]); return; }
    const { CommunityService } = await import("../services/CommunityService");
    const cs = new CommunityService();
    const results = await cs.findAllByEname(ename);
    res.json(results.map(({ community: c, isFacilitator }) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        primary_color: c.primary_color,
        title_font: c.title_font,
        isFacilitator,
    })));
}
```

- [ ] **Step 3: Update `getMe` to accept `?communityId`**

Replace the existing `getMe` function in `api/src/controllers/AuthController.ts`:

```ts
/** GET /api/auth/me
 *  Returns current user + community from JWT.
 *  Accepts optional ?communityId=uuid to scope to a specific community.
 */
export async function getMe(req: Request, res: Response) {
    const { userId, ename } = req.user!;
    const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
    const { findById } = await import("../services/UserService");
    const { CommunityService } = await import("../services/CommunityService");
    const user = await findById(userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const cs = new CommunityService();
    let community = null;
    let member = null;
    if (communityId) {
        community = await cs.findById(communityId);
        if (!community) { res.status(404).json({ error: "Community not found" }); return; }
        member = ename ? await cs.findMemberByEname(community.id, ename) : null;
    } else {
        community = ename ? await cs.findByFacilitatorEname(ename) : null;
        if (!community && ename) community = await cs.findByMemberEname(ename);
        member = (community && ename) ? await cs.findMemberByEname(community.id, ename) : null;
    }
    const isFacilitator = member?.is_facilitator ?? (community?.facilitator_ename === ename) ?? false;
    res.json({ ...serializeUser(user), community, member, isFacilitator });
}
```

- [ ] **Step 4: Register the new route in `api/src/index.ts`**

Find the line `app.get("/api/auth/me", requireAuth, getMe);` and update the import + add the route:

Change the import at line 15 from:
```ts
import { getOffer, epassportLogin, sseAuthStream, getSessionResult, getMe, devLogin } from "./controllers/AuthController";
```
To:
```ts
import { getOffer, epassportLogin, sseAuthStream, getSessionResult, getMe, getMyCommunities, devLogin } from "./controllers/AuthController";
```

After `app.get("/api/auth/me", requireAuth, getMe);` add:
```ts
app.get("/api/auth/communities", requireAuth, getMyCommunities);
```

- [ ] **Step 5: Verify with curl**

Start the API (`npm run dev` in `api/`) and run:
```bash
# First get a token via dev-login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# Test communities endpoint
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/auth/communities | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

# Test getMe with communityId
COMMUNITY_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/auth/communities | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.parse(d)[0]?.id))")
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/auth/me?communityId=$COMMUNITY_ID" | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected: communities returns an array with at least one entry; getMe with communityId returns user + community + isFacilitator.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/CommunityService.ts api/src/controllers/AuthController.ts api/src/index.ts
git commit -m "feat: add GET /api/auth/communities + communityId param to getMe"
```

---

### Task 2: Backend — scope community + meetings endpoints to selected communityId

**Files:**
- Modify: `api/src/controllers/CommunityController.ts`
- Modify: `api/src/controllers/MeetingController.ts`

**Background:** `GET /api/community` currently finds community by `findByFacilitatorEname` — wrong for multi-community users. `GET /api/meetings` currently uses `findByFacilitatorEname` only, ignoring regular members. Both need to accept `?communityId` when the client knows which community is selected.

- [ ] **Step 1: Update `CommunityController.get` to accept `?communityId`**

Replace the `get` method in `api/src/controllers/CommunityController.ts`:

```ts
/** GET /api/community — returns the selected community (by ?communityId) or first match */
get = async (req: Request, res: Response) => {
    try {
        const ename = req.user!.ename;
        const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
        let community = null;
        if (communityId) {
            community = await svc.findById(communityId);
        } else {
            community =
                (await svc.findByFacilitatorEname(ename)) ??
                (await svc.findByMemberEname(ename));
        }
        if (!community) return res.status(404).json({ error: "No community found" });
        res.json(community);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};
```

- [ ] **Step 2: Update `MeetingController.list` to accept `?communityId` and fall back to member community**

In `api/src/controllers/MeetingController.ts`, replace the `list` method. Current code (around lines 21-30):

```ts
// If authenticated facilitator, scope to their community
let communityId: string | undefined;
if (req.user?.ename) {
    const community = await commSvc.findByFacilitatorEname(req.user.ename);
    communityId = community?.id;
}
const meetings = await svc.findAll(communityId);
```

Replace with:

```ts
// Scope to the explicitly selected community, or find it from ename
let communityId: string | undefined;
if (typeof req.query.communityId === 'string') {
    communityId = req.query.communityId;
} else if (req.user?.ename) {
    const community =
        (await commSvc.findByFacilitatorEname(req.user.ename)) ??
        (await commSvc.findByMemberEname(req.user.ename));
    communityId = community?.id;
}
const meetings = await svc.findAll(communityId);
```

- [ ] **Step 3: Verify meetings scoping**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
COMMUNITY_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/auth/communities | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.parse(d)[0]?.id))")

curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/meetings?communityId=$COMMUNITY_ID" | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log('meetings:', JSON.parse(d).length))"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/community?communityId=$COMMUNITY_ID" | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log('community:', JSON.parse(d).name))"
```

Expected: both return data scoped to the correct community.

- [ ] **Step 4: Commit**

```bash
git add api/src/controllers/CommunityController.ts api/src/controllers/MeetingController.ts
git commit -m "feat: add ?communityId scoping to community and meetings endpoints"
```

---

### Task 3: Frontend — API client + UserContext

**Files:**
- Modify: `app/src/api/client.js`
- Modify: `app/src/context/UserContext.jsx`

- [ ] **Step 1: Update API client functions**

In `app/src/api/client.js`, replace these three lines:

```js
export const getMe = () => req('GET', '/auth/me')
```
```js
export const getCommunity = () => req('GET', '/community')
```
```js
export const getAllMeetings = () => req('GET', '/meetings')
```

With:

```js
export const getMe = (communityId) => req('GET', `/auth/me${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
export const getCommunities = () => req('GET', '/auth/communities')
export const getCommunity = (communityId) => req('GET', `/community${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
export const getAllMeetings = (communityId) => req('GET', `/meetings${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
```

- [ ] **Step 2: Rewrite UserContext**

Replace the entire contents of `app/src/context/UserContext.jsx`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe, getCommunities } from '../api/client'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFacilitator, setIsFacilitator] = useState(false)
  const [communityId, setCommunityId] = useState(null)
  const [communities, setCommunities] = useState([])

  // After a valid token exists, resolve which community to use
  const resolveSession = useCallback(async () => {
    try {
      const allCommunities = await getCommunities()
      setCommunities(allCommunities)

      const storedId = localStorage.getItem('alver_community_id')
      const validStored = allCommunities.find(c => c.id === storedId)

      let selectedId = null
      if (allCommunities.length === 1) {
        selectedId = allCommunities[0].id
        localStorage.setItem('alver_community_id', selectedId)
      } else if (validStored) {
        selectedId = storedId
      }
      // If length > 1 and no valid stored id: selectedId stays null → picker will show

      setCommunityId(selectedId)
      const me = await getMe(selectedId)
      setUser(me)
      setIsFacilitator(me.isFacilitator ?? false)
    } catch {
      localStorage.removeItem('alver_token')
      localStorage.removeItem('alver_community_id')
      setToken(null)
      setUser(null)
      setCommunityId(null)
      setIsFacilitator(false)
      setCommunities([])
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('alver_token')
    if (!stored) { setLoading(false); return }
    setToken(stored)
    resolveSession()
  }, [resolveSession])

  // Regular login (attendee or eID)
  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    setUser(newUser)
    resolveSession()
  }, [resolveSession])

  // Facilitator login — same flow, resolveSession sets isFacilitator from getMe
  const loginAsFacilitator = useCallback((newToken, newUser) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    setUser(newUser)
    resolveSession()
  }, [resolveSession])

  // User picks a community from the picker
  const selectCommunity = useCallback((id) => {
    localStorage.setItem('alver_community_id', id)
    setCommunityId(id)
    getMe(id).then(me => {
      setUser(me)
      setIsFacilitator(me.isFacilitator ?? false)
    }).catch(console.error)
  }, [])

  // User wants to switch community — clears selection, shows picker again
  const switchCommunity = useCallback(() => {
    localStorage.removeItem('alver_community_id')
    setCommunityId(null)
    setIsFacilitator(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('alver_token')
    localStorage.removeItem('alver_community_id')
    localStorage.removeItem('alver_my_name')
    localStorage.removeItem('alver_facilitator_mode')
    setToken(null)
    setUser(null)
    setCommunityId(null)
    setIsFacilitator(false)
    setCommunities([])
  }, [])

  return (
    <UserContext.Provider value={{
      user, token, loading, isFacilitator,
      communityId, communities,
      login, loginAsFacilitator, logout,
      selectCommunity, switchCommunity,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
```

- [ ] **Step 3: Verify dev server starts without errors**

```bash
cd app && npm run dev
```

Open `http://localhost:5174` in the browser. Expected: no console errors, login screen appears normally.

- [ ] **Step 4: Commit**

```bash
git add app/src/api/client.js app/src/context/UserContext.jsx
git commit -m "feat: update API client + UserContext for multi-community selection"
```

---

### Task 4: Frontend — CommunityPicker component + App.jsx gate

**Files:**
- Create: `app/src/components/CommunityPicker.jsx`
- Modify: `app/src/App.jsx`

- [ ] **Step 1: Create CommunityPicker component**

Create `app/src/components/CommunityPicker.jsx`:

```jsx
import { useTranslation } from 'react-i18next'

/**
 * Full-screen community selection screen.
 * Shown after login when the user belongs to more than one community.
 *
 * Props:
 *   communities — array of { id, name, slug, logo_url, primary_color, isFacilitator }
 *   onSelect    — called with community id when user picks one
 */
export default function CommunityPicker({ communities, onSelect }) {
  const { t } = useTranslation()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--color-cream, #faf8f5)',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-title, serif)',
        fontSize: '1.6rem',
        fontWeight: 700,
        marginBottom: 8,
        color: 'var(--color-charcoal, #2c2c2c)',
        textAlign: 'center',
      }}>
        {t('community_picker.title')}
      </h1>
      <p style={{
        fontSize: '0.95rem',
        color: 'var(--color-muted, #888)',
        marginBottom: 32,
        textAlign: 'center',
      }}>
        {t('community_picker.subtitle')}
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        maxWidth: 420,
      }}>
        {communities.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              background: 'white',
              border: `2px solid ${c.primary_color || 'var(--color-sand, #e8e0d5)'}`,
              borderRadius: 12,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            {/* Logo or color swatch */}
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: c.primary_color || '#C4622D',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {c.logo_url
                ? <img src={c.logo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>
                    {c.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
              }
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '0.97rem',
                color: 'var(--color-charcoal, #2c2c2c)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {c.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-muted, #888)', marginTop: 2 }}>
                {c.isFacilitator
                  ? t('community_picker.role_facilitator')
                  : t('community_picker.role_member')}
              </div>
            </div>

            <span style={{ color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `CommunityPickerGate` to App.jsx**

Replace `app/src/App.jsx` with:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MeetingProvider } from './context/MeetingContext'
import { UserProvider, useUser } from './context/UserContext'
import { CommunityProvider } from './context/CommunityContext'
import CommunityPicker from './components/CommunityPicker'
import Home from './views/Home'
import Facilitate from './views/Facilitate'
import FacilitatorLogin from './views/FacilitatorLogin'
import Attend from './views/Attend'
import Register from './views/Register'
import Display from './views/Display'
import Archive from './views/Archive'
import Aanmelden from './views/Aanmelden'
import DeeplinkLogin from './views/DeeplinkLogin'
import AdminLogin from './views/AdminLogin'
import AdminDashboard from './views/AdminDashboard'

/** Shows CommunityPicker when user is logged in but hasn't selected a community yet */
function CommunityPickerGate({ children }) {
  const { token, loading, communityId, communities, selectCommunity } = useUser()
  if (loading) return null
  if (token && communities.length > 1 && !communityId) {
    return <CommunityPicker communities={communities} onSelect={selectCommunity} />
  }
  return children
}

export default function App() {
  return (
    <UserProvider>
    <CommunityProvider>
    <MeetingProvider>
      <BrowserRouter>
        <CommunityPickerGate>
          <Routes>
            <Route path="/deeplink-login" element={<DeeplinkLogin />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/" element={<Home />} />
            <Route path="/facilitator-login" element={<FacilitatorLogin />} />
            <Route path="/:communitySlug/meeting/:id/facilitate" element={<Facilitate />} />
            <Route path="/:communitySlug/meeting/:id/attend" element={<Attend />} />
            <Route path="/:communitySlug/meeting/:id/register" element={<Register />} />
            <Route path="/:communitySlug/meeting/:id/display" element={<Display />} />
            <Route path="/:communitySlug/meeting/:id/archive" element={<Archive />} />
            <Route path="/aanmelden" element={<Aanmelden />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CommunityPickerGate>
      </BrowserRouter>
    </MeetingProvider>
    </CommunityProvider>
    </UserProvider>
  )
}
```

- [ ] **Step 3: Manual test — single community user**

Log in as a user who belongs to one community. Expected: no picker shown, app loads directly as today.

- [ ] **Step 4: Manual test — multi-community user**

Add your eID ename as a member of a second community via the admin panel. Log out and log back in. Expected: community picker appears showing both communities with their colors and names. Click one → app loads with that community's branding.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/CommunityPicker.jsx app/src/App.jsx
git commit -m "feat: add CommunityPicker screen and CommunityPickerGate in App"
```

---

### Task 5: Frontend — CommunityContext + AppHeader switch + Home + i18n

**Files:**
- Modify: `app/src/context/CommunityContext.jsx`
- Modify: `app/src/components/AppHeader.jsx`
- Modify: `app/src/components/FacilitatorHeader.jsx`
- Modify: `app/src/views/Home.jsx`
- Modify: `app/src/locales/en.json`
- Modify: `app/src/locales/nl.json`

- [ ] **Step 1: Update CommunityContext to pass communityId to API**

In `app/src/context/CommunityContext.jsx`, update the imports and the `load` callback:

Change the import at the top:
```jsx
import { useUser } from './UserContext'
```
(already present — no change needed here)

Change the destructure inside `CommunityProvider`:
```jsx
const { user, communityId } = useUser()
```
(was: `const { user } = useUser()`)

Change the `load` callback to pass `communityId` and add it to the dependency array:
```jsx
const load = useCallback(async () => {
  setLoading(true)
  try {
    if (user) {
      const c = await api.getCommunity(communityId)
      setCommunity(c)
      setMembers(c.members || [])
      applyTheme(c)
    } else {
      const branding = await api.getCommunityBranding()
      setCommunity(prev => prev ?? branding)
      applyTheme(branding)
    }
  } catch {
    // community may not be configured yet — that's fine
  } finally {
    setLoading(false)
  }
}, [user, communityId])
```

- [ ] **Step 2: Add `onSwitchCommunity` prop to AppHeader**

In `app/src/components/AppHeader.jsx`, update the props definition:

```jsx
export default function AppHeader({
  logo,
  title,
  liveIndicator = false,
  user,
  isFacilitator = false,
  onSettings,
  onMembers,
  onLogout,
  onSwitchCommunity,   // ← add this
  right,
}) {
```

Add the menu item inside the dropdown, after the language switcher and before facilitator items:

```jsx
{onSwitchCommunity && (
  <MenuItem onClick={() => { onSwitchCommunity(); setShowMenu(false) }}>
    🔀 {t('community_picker.switch_btn')}
  </MenuItem>
)}
```

Place it immediately after the language toggle `MenuItem` and before the `{isFacilitator && onMembers && ...}` block.

- [ ] **Step 3: Pass `switchCommunity` in FacilitatorHeader**

In `app/src/components/FacilitatorHeader.jsx`, update the destructure:

```jsx
const { user, logout, communities, switchCommunity } = useUser()
```
(was: `const { user, logout } = useUser()`)

And pass it to AppHeader:
```jsx
<AppHeader
  ...
  onSwitchCommunity={communities.length > 1 ? switchCommunity : undefined}
  ...
/>
```

The exact line to add is next to the existing `onLogout={logout}` line.

- [ ] **Step 4: Update Home.jsx — pass communityId to getAllMeetings and switchCommunity to AppHeader**

In `app/src/views/Home.jsx`, update the `useUser` destructure:

```jsx
const { user, isFacilitator, loading: authLoading, login, logout, communityId, communities, switchCommunity } = useUser()
```
(was: `const { user, isFacilitator, loading: authLoading, login, logout } = useUser()`)

Update `loadMeetings`:
```jsx
function loadMeetings() {
  setMeetingsLoading(true)
  getAllMeetings(communityId)
    .then(setMeetings)
    .catch(e => setError(e.message))
    .finally(() => setMeetingsLoading(false))
}
```
(was: `getAllMeetings()`)

Update the `useEffect` dependency array:
```jsx
useEffect(() => { loadMeetings() }, [user, communityId])
```
(was: `[user]`)

Update the AppHeader render (around line 226):
```jsx
<AppHeader
  logo={community?.logo_url}
  user={user}
  isFacilitator={isFacilitator}
  onLogout={logout}
  onSwitchCommunity={communities.length > 1 ? switchCommunity : undefined}
/>
```
(was: `<AppHeader logo={community?.logo_url} user={user} onLogout={logout} />`)

- [ ] **Step 5: Add i18n strings to en.json**

In `app/src/locales/en.json`, add this section before the closing `}`:

```json
  "community_picker": {
    "title": "Choose a community",
    "subtitle": "You are a member of multiple communities. Which one would you like to enter?",
    "role_facilitator": "Facilitator",
    "role_member": "Member",
    "switch_btn": "Switch community"
  }
```

- [ ] **Step 6: Add i18n strings to nl.json**

In `app/src/locales/nl.json`, add the same section before the closing `}`:

```json
  "community_picker": {
    "title": "Kies een gemeenschap",
    "subtitle": "Je bent lid van meerdere gemeenschappen. Welke wil je betreden?",
    "role_facilitator": "Facilitator",
    "role_member": "Lid",
    "switch_btn": "Wissel van gemeenschap"
  }
```

- [ ] **Step 7: Full end-to-end manual test**

1. Log out completely
2. Log in with an eID that belongs to one community → expected: no picker, app loads normally
3. Add your ename as a member of a second community (via admin panel or direct DB insert)
4. Log out and log back in → expected: picker shows with both communities, correct colors and names
5. Click one → expected: app loads with that community's branding, meetings scoped to it
6. Open user dropdown → expected: "Switch community" button is visible
7. Click "Switch community" → expected: picker reappears
8. Pick the other community → expected: branding changes, meetings list updates
9. Refresh the page → expected: same community is still selected (localStorage persists)
10. Log out → expected: community selection is cleared

- [ ] **Step 8: Commit**

```bash
git add app/src/context/CommunityContext.jsx app/src/components/AppHeader.jsx app/src/components/FacilitatorHeader.jsx app/src/views/Home.jsx app/src/locales/en.json app/src/locales/nl.json
git commit -m "feat: wire communityId through CommunityContext, AppHeader switch button, Home meetings scope"
```
