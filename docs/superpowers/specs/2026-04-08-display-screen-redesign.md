# Display Screen Redesign

## Overview

Redesign the Display (projector/screen) view with: manual day/night theming controlled by the facilitator, language propagation from facilitator to Display via SSE, logo visible during voting, full-width voting layout, greeting flash bug fix, VotePie crop fix, "voting_open" label removed, and a 5-color theme-aware chart palette.

---

## 1. Architecture

### New SSE Events

Two new event types flow from server → Display via the existing SSE channel:

| Event | Payload | Trigger |
|---|---|---|
| `screen_theme` | `{ theme: 'day' \| 'night' }` | Facilitator toggles day/night |
| `screen_language` | `{ language: 'en' \| 'nl' }` | Facilitator changes language while meeting is in_session |

### State in MeetingService

Two new Maps alongside existing `displayModes`:

```typescript
private screenThemes   = new Map<string, 'day' | 'night'>()
private screenLanguages = new Map<string, string>()

setScreenTheme(meetingId: string, theme: 'day' | 'night'): void
getScreenTheme(meetingId: string): 'day' | 'night'   // default: 'day'
setScreenLanguage(meetingId: string, lang: string): void
getScreenLanguage(meetingId: string): string          // default: 'nl'
```

Both Maps are cleared on `transitionStatus` to `'archived'` and in `reopen()`, alongside `displayModes.delete(id)`.

### New API Endpoints

```
PATCH /api/meetings/:id/screen-theme     { theme: 'day' | 'night' }
PATCH /api/meetings/:id/screen-language  { language: 'en' | 'nl' }
```

Both: `requireAuth` + `requireFacilitatorOfMeeting`. Validate input, store in service, emit SSE, return `{ theme }` / `{ language }`.

---

## 2. Backend Changes

### `api/src/services/MeetingService.ts`

Add `screenThemes` and `screenLanguages` Maps with getters/setters. Default theme `'day'`, default language `'nl'`. Clear both on archive and reopen.

### `api/src/controllers/MeetingController.ts`

Add two handlers:
- `setScreenTheme`: validates `['day','night']`, calls `svc.setScreenTheme`, emits `sseService.emit(id, 'screen_theme', { meetingId: id, theme })`
- `setScreenLanguage`: validates `['en','nl']`, calls `svc.setScreenLanguage`, emits `sseService.emit(id, 'screen_language', { meetingId: id, language })`

### `api/src/index.ts`

```typescript
app.patch("/api/meetings/:id/screen-theme",    requireAuth, requireFacilitatorOfMeeting, meeting.setScreenTheme)
app.patch("/api/meetings/:id/screen-language", requireAuth, requireFacilitatorOfMeeting, meeting.setScreenLanguage)
```

---

## 3. Frontend — State & API

### `app/src/api/client.js`

```js
export const setScreenTheme    = (id, theme)    => req('PATCH', `/meetings/${id}/screen-theme`,    { theme })
export const setScreenLanguage = (id, language) => req('PATCH', `/meetings/${id}/screen-language`, { language })
```

### `app/src/context/MeetingContext.jsx`

Add state:
```jsx
const [screenTheme,    setScreenTheme]    = useState('day')
const [screenLanguage, setScreenLanguage] = useState('nl')
```

SSE handler additions:
```jsx
if (event.event === 'screen_theme') {
  if (['day','night'].includes(event.theme)) setScreenTheme(event.theme)
  return
}
if (event.event === 'screen_language') {
  if (['en','nl'].includes(event.language)) setScreenLanguage(event.language)
  return
}
```

Reset on `setMeetingId`: add `setScreenTheme('day')` and `setScreenLanguage('nl')` alongside `setDisplayMode('numbers')`.

Expose `screenTheme` and `screenLanguage` in context value.

---

## 4. Frontend — Facilitate.jsx

### Day/Night Toggle

Placed in the buttons row alongside `open_display` link (line 161 area):

```jsx
<button
  onClick={() => apiSetScreenTheme(meeting.id, screenTheme === 'day' ? 'night' : 'day').catch(console.error)}
  style={{ /* same style family as existing buttons in that row */ }}
>
  {screenTheme === 'day' ? '🌙' : '☀️'} {t('facilitate.screen_theme_toggle')}
</button>
```

Destructure `screenTheme` from `useMeeting()`. Import `setScreenTheme as apiSetScreenTheme` from `../api/client`.

### Language → Screen Propagation

In Facilitate.jsx, add a `useEffect` that propagates language changes to Display when the meeting is in session:

```jsx
const { i18n } = useTranslation()
useEffect(() => {
  if (meeting?.phase === 'in_session' && meeting?.id) {
    apiSetScreenLanguage(meeting.id, i18n.language).catch(console.error)
  }
}, [i18n.language, meeting?.id, meeting?.phase])
```

This reacts to language change regardless of where in the UI it was triggered (profile menu, etc.). No changes needed to LanguageSwitcher or the profile menu itself.

### i18n Keys

Add to `en.json` and `nl.json`:
- `facilitate.screen_theme_toggle`: `"Screen theme"` / `"Schermthema"`

---

## 5. Frontend — Display.jsx

### Language Sync

Remove `LanguageSwitcher` import and JSX (line 6 import + lines 129–131 JSX block). Add:

```jsx
const { i18n } = useTranslation()
useEffect(() => {
  if (screenLanguage) i18n.changeLanguage(screenLanguage)
}, [screenLanguage])
```

### Theme Object

Derive from `screenTheme` (from `useMeeting()`):

```jsx
const isDark = screenTheme === 'night'
const theme = isDark
  ? { bg: '#1A1612', text: 'white',                  muted: 'rgba(255,255,255,0.5)',   greetingBg: 'rgba(26,22,18,0.95)' }
  : { bg: 'var(--color-cream)', text: 'var(--color-charcoal)', muted: 'rgba(44,42,39,0.45)', greetingBg: 'rgba(245,240,232,0.95)' }
```

Root `<div>` uses `theme.bg` and `theme.text` instead of the current `isCheckin ? ... : ...` conditionals.

Background texture radial gradient: shown in night mode only (keep existing), removed in day mode.

### Greeting Flash Bug Fix

Change `prevCheckedIn` from `useRef(0)` to `useRef(null)`:

```jsx
const prevCheckedIn = useRef(null)

useEffect(() => {
  if (!meeting) return
  const cur = meeting.checkedIn.length
  if (prevCheckedIn.current === null) {
    prevCheckedIn.current = cur   // initialize silently on first load
    return
  }
  if (cur > prevCheckedIn.current) {
    // show greeting ...
  }
  prevCheckedIn.current = cur
}, [meeting?.checkedIn])
```

### CheckinDisplay

Change `dark={false}` → `dark={isDark}`. The existing `c` color token object already handles both modes correctly.

### VotingDisplay — Full Redesign

Remove `maxWidth: 900`. Remove `display.voting_open` label (lines 277–279).

New layout — full width, three-zone vertical stack:

```
┌─────────────────────────────────────────────────────┐
│ [Logo 48px]        [Poll Title — centered]   [N/total]│  ← header row, padding 40px sides
├─────────────────────────────────────────────────────┤
│            [Progress bar — full width]               │  ← 8px tall, 40px v-margin
├─────────────────────────────────────────────────────┤
│                   [Chart area]                       │  ← flex-grow, centered
└─────────────────────────────────────────────────────┘
```

Logo: `community?.logo_url` → `<img height="48" />`, fallback to `🏛️ ALVer` text.

Poll title: `fontFamily: 'var(--font-title)'`, `fontSize: clamp(1.8rem, 3vw, 2.8rem)`, centered.

Vote count (right): `{totalVotes} / {attendeeCount}`, muted text.

Progress bar: full width (remove `maxWidth: 400`, remove `margin: auto`). Height 8px.

Chart area: `flex: 1`, `display: flex`, `alignItems: center`, `justifyContent: center`. No maxWidth.

Pass `colors` prop to charts: `CHART_COLORS_NIGHT` when `isDark`, `CHART_COLORS_DAY` when day.

### ResultDisplay

Apply same header pattern (logo + poll title). Remove `maxWidth: 900`. Pass `colors` to chart if shown.

### BetweenItems and ClosedDisplay

Apply `theme.text` and `theme.muted` colors instead of hardcoded `rgba(255,255,255,...)`.

---

## 6. Chart Components & Color Palette

### `app/src/components/charts/chartUtils.js`

Add and export palette constants:

```js
export const CHART_COLORS_NIGHT = ['#E8C27A', '#6BBFCC', '#9BCB8A', '#E08888', '#9B8FCC']
export const CHART_COLORS_DAY   = ['#C4A040', '#3A9AAA', '#5A9B60', '#C05A5A', '#6B5EAA']
```

| # | Name   | Night      | Day        |
|---|--------|------------|------------|
| 1 | Gold   | `#E8C27A`  | `#C4A040`  |
| 2 | Teal   | `#6BBFCC`  | `#3A9AAA`  |
| 3 | Sage   | `#9BCB8A`  | `#5A9B60`  |
| 4 | Coral  | `#E08888`  | `#C05A5A`  |
| 5 | Violet | `#9B8FCC`  | `#6B5EAA`  |

### `VoteBar.jsx`, `VotePie.jsx`, `VoteBubbles.jsx`

Each accepts a `colors` prop (array), defaulting to `CHART_COLORS_NIGHT`:

```jsx
export default function VoteBar({ poll, colors = CHART_COLORS_NIGHT }) { ... }
```

Replace internal hardcoded `COLORS` arrays with the `colors` prop.

### VotePie Crop Fix

The SVG container currently has no explicit height, causing browser clipping. Fix:

```jsx
<div style={{ height: 130, flexShrink: 0 }}>
  <svg width="130" height="130" viewBox="0 0 32 32" style={{ overflow: 'visible', transform: 'rotate(-90deg)' }}>
```

`overflow: 'visible'` ensures the stroke (which extends beyond viewBox at the edges) is not clipped.

---

## 7. Out of Scope

- Persisting screen theme/language across server restarts (in-memory is sufficient)
- Supporting additional languages beyond `en` / `nl`
- Community branding color appearing in charts (stays decorative: logo, QR glow)
- Any changes to the Attend or Facilitate layout
