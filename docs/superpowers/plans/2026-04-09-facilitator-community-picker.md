# Facilitator Community Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the community picker so facilitator sessions only show communities where the user is actually a facilitator, preventing the Android Firefox bug where picking the wrong community silently resulted in an attendee session.

**Architecture:** Two-layer fix — `resolveSession` in UserContext filters to facilitator-only communities for stored-id validation and auto-selection; `CommunityPickerGate` in App.jsx filters the list passed to CommunityPicker; CommunityPicker renders a different title and an error state for the facilitator path. No API changes.

**Tech Stack:** React, i18next, localStorage

---

## File Map

**Modify:**
- `app/src/context/UserContext.jsx` — filter to facilitator communities in `resolveSession` when `forceAttendee=false`
- `app/src/App.jsx` — filter communities list before passing to CommunityPicker
- `app/src/components/CommunityPicker.jsx` — facilitator title, remove facilitator badge, add empty-list error state
- `app/src/locales/nl.json` — add `facilitator_title`, `no_facilitator_communities`, `back_to_attendee`; remove `role_facilitator`
- `app/src/locales/en.json` — same

---

## Task 1: Update i18n strings

**Files:**
- Modify: `app/src/locales/nl.json`
- Modify: `app/src/locales/en.json`

- [ ] **Step 1: Update nl.json `community_picker` block**

Replace the entire `community_picker` block:

```json
  "community_picker": {
    "title": "Kies een gemeenschap",
    "subtitle": "Je bent lid van meerdere gemeenschappen. Welke wil je betreden?",
    "facilitator_title": "Je bent facilitator van meerdere communities",
    "no_facilitator_communities": "Je hebt geen facilitatorrechten in een community.",
    "back_to_attendee": "← Terug naar attendee login",
    "role_member": "Lid",
    "switch_btn": "Wissel van gemeenschap"
  },
```

(Note: `role_facilitator` is removed — no longer used.)

- [ ] **Step 2: Update en.json `community_picker` block**

Replace the entire `community_picker` block:

```json
  "community_picker": {
    "title": "Choose a community",
    "subtitle": "You are a member of multiple communities. Which one would you like to enter?",
    "facilitator_title": "You are a facilitator of multiple communities",
    "no_facilitator_communities": "You don't have facilitator rights in any community.",
    "back_to_attendee": "← Back to attendee login",
    "role_member": "Member",
    "switch_btn": "Switch community"
  },
```

- [ ] **Step 3: Commit**

```bash
git add app/src/locales/nl.json app/src/locales/en.json
git commit -m "feat: update community_picker i18n for facilitator flow"
```

---

## Task 2: Update CommunityPicker component

**Files:**
- Modify: `app/src/components/CommunityPicker.jsx`

The component already accepts `isFacilitatorSession`. Changes:
- Use `facilitator_title` instead of `title` when `isFacilitatorSession`
- Remove the `role_facilitator` badge (lines 99-103 in current file)
- Add empty-list error state when `isFacilitatorSession && communities.length === 0`

- [ ] **Step 1: Replace CommunityPicker.jsx with the updated version**

```jsx
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function CommunityPicker({ communities, onSelect, isFacilitatorSession = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Error state: facilitator login but no facilitator communities
  if (isFacilitatorSession && communities.length === 0) {
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
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</div>
        <h1 style={{
          fontFamily: 'var(--font-title, serif)',
          fontSize: '1.4rem',
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--color-charcoal, #2c2c2c)',
          textAlign: 'center',
        }}>
          {t('community_picker.no_facilitator_communities')}
        </h1>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-terracotta)',
            fontSize: '0.95rem',
            fontWeight: 500,
          }}
        >
          {t('community_picker.back_to_attendee')}
        </button>
      </div>
    )
  }

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
        {isFacilitatorSession ? t('community_picker.facilitator_title') : t('community_picker.title')}
      </h1>
      {!isFacilitatorSession && (
        <p style={{
          fontSize: '0.95rem',
          color: 'var(--color-muted, #888)',
          marginBottom: 32,
          textAlign: 'center',
        }}>
          {t('community_picker.subtitle')}
        </p>
      )}
      {isFacilitatorSession && <div style={{ marginBottom: 32 }} />}

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
                ? <img src={c.logo_url} alt={c.name} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
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
            </div>

            <span style={{ color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/CommunityPicker.jsx
git commit -m "feat: facilitator picker shows correct title and error state; remove role badge"
```

---

## Task 3: Fix resolveSession in UserContext

**Files:**
- Modify: `app/src/context/UserContext.jsx`

Current `resolveSession` treats all communities equally. When `forceAttendee=false`, it must use only facilitator communities for stored-id validation and auto-selection.

- [ ] **Step 1: Replace the `resolveSession` callback**

In `app/src/context/UserContext.jsx`, replace the full `resolveSession` function:

```javascript
const resolveSession = useCallback(async (forceAttendee = false) => {
  try {
    const allCommunities = await getCommunities()
    setCommunities(allCommunities)

    // For facilitator sessions, only consider communities where user is facilitator
    const eligibleCommunities = forceAttendee
      ? allCommunities
      : allCommunities.filter(c => c.isFacilitator)

    const storedId = localStorage.getItem('alver_community_id')
    const validStored = eligibleCommunities.find(c => c.id === storedId)

    let selectedId = null
    if (eligibleCommunities.length === 1) {
      selectedId = eligibleCommunities[0].id
      localStorage.setItem('alver_community_id', selectedId)
    } else if (validStored) {
      selectedId = storedId
    }
    // If length > 1 and no valid stored id: selectedId stays null → picker will show

    setCommunityId(selectedId)
    const me = await getMe(selectedId)
    setUser(me)

    let isFac = false
    if (!forceAttendee) {
      if (selectedId) {
        isFac = me.isFacilitator ?? false
      } else {
        isFac = eligibleCommunities.length > 0
      }
    }
    setIsFacilitator(isFac)
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
```

Key changes from the original:
- `eligibleCommunities` is `allCommunities.filter(c => c.isFacilitator)` when `forceAttendee=false`, otherwise `allCommunities`
- `validStored` checks against `eligibleCommunities` (not `allCommunities`)
- Auto-select uses `eligibleCommunities.length === 1` (not `allCommunities.length === 1`)
- `isFac` fallback (no community selected yet) uses `eligibleCommunities.length > 0` — if there are facilitator communities, the user is a facilitator; the picker will let them choose

- [ ] **Step 2: Commit**

```bash
git add app/src/context/UserContext.jsx
git commit -m "fix: resolveSession uses facilitator-filtered communities for auto-selection and stored-id validation"
```

---

## Task 4: Filter communities list in CommunityPickerGate

**Files:**
- Modify: `app/src/App.jsx`

`CommunityPickerGate` currently passes `communities` (all) to `CommunityPicker`. For facilitator sessions it must pass only the facilitator subset.

- [ ] **Step 1: Update CommunityPickerGate in App.jsx**

Replace the `CommunityPickerGate` function:

```javascript
function CommunityPickerGate({ children }) {
  const { token, loading, communityId, communities, selectCommunity } = useUser()
  if (loading) return null
  if (token && !communityId) {
    const isFacilitatorSession = localStorage.getItem('alver_facilitator_mode') === 'true'
    const pickerCommunities = isFacilitatorSession
      ? communities.filter(c => c.isFacilitator)
      : communities
    // Show picker if: multiple eligible communities, OR facilitator with none (to show error)
    if (pickerCommunities.length !== 1 && (isFacilitatorSession || communities.length > 1)) {
      return <CommunityPicker communities={pickerCommunities} onSelect={selectCommunity} isFacilitatorSession={isFacilitatorSession} />
    }
  }
  return children
}
```

Note: the original condition was `communities.length > 1 && !communityId`. The new condition also handles the `0 facilitator communities` error case (shows the picker's error state), and skips the picker entirely when there's exactly 1 eligible community (resolveSession already auto-selected it).

- [ ] **Step 2: Build to verify no TypeScript/JSX errors**

```bash
cd app && npm run build 2>&1 | grep -E "error|Error|✓"
```

Expected: `✓ built in ...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/App.jsx
git commit -m "fix: CommunityPickerGate passes facilitator-filtered communities to picker"
```

---

## Task 5: Manual verification and push

- [ ] **Step 1: Verify facilitator flow (1 community)**

Start dev servers. Log in via `/facilitator` as a user who is facilitator of exactly 1 community.
Expected: no picker shown, lands directly on dashboard as facilitator.

- [ ] **Step 2: Verify facilitator flow (multiple communities)**

Log in via `/facilitator` as a user who is facilitator of 2+ communities.
Expected: picker shows only those 2+ communities, title is "Je bent facilitator van meerdere communities", no role badge under entries.

- [ ] **Step 3: Verify facilitator flow (0 facilitator communities)**

Log in via `/facilitator` as a user who is a member but not a facilitator of any community.
Expected: error screen with lock icon and "← Terug naar attendee login" link.

- [ ] **Step 4: Verify attendee flow unchanged**

Log in via `/` (attendee). If member of multiple communities, picker shows all of them with the original title and subtitle. No regression.

- [ ] **Step 5: Verify stale stored communityId is ignored**

With `alver_facilitator_mode=true` in localStorage and `alver_community_id` set to a community where the user is only a member (not facilitator): reload the page.
Expected: stored id is ignored, picker shown (or auto-select if 1 facilitator community).

- [ ] **Step 6: Push**

```bash
git push
```

Expected: Coolify rebuilds. Test on Android Firefox after redeploy.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Facilitator sessions only show facilitator communities in picker (Task 4)
- ✅ Facilitator auto-select uses filtered list (Task 3)
- ✅ Stale stored communityId from attendee session ignored (Task 3 — `validStored` checks `eligibleCommunities`)
- ✅ 0 facilitator communities → error state (Task 2 + Task 4)
- ✅ 1 facilitator community → auto-selected, no picker (Task 3 handles this in `resolveSession`)
- ✅ Facilitator picker title updated (Task 2)
- ✅ Role badge removed (Task 2)
- ✅ Attendee flow unchanged (Task 3 — `forceAttendee=true` uses `allCommunities`)
- ✅ i18n strings added/cleaned up (Task 1)
