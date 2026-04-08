# Display Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Display (projector) view with manual day/night theming, facilitator-driven language propagation, full-width voting layout with community logo, chart palette, and several bug fixes.

**Architecture:** Two new SSE event types (`screen_theme`, `screen_language`) flow from new PATCH endpoints through `MeetingService` Maps to `MeetingContext`, then drive Display.jsx entirely — Display has no local theme or language control. Chart components accept a `colors` prop from their caller rather than hardcoding palette arrays.

**Tech Stack:** TypeScript/Express API, React 18, react-i18next, SVG charts (no library), SSE via existing sseService.

---

## File Map

| File | Change |
|---|---|
| `api/src/services/MeetingService.ts` | Add `screenThemes` + `screenLanguages` Maps with getters/setters; clear on archive/reopen |
| `api/src/controllers/MeetingController.ts` | Add `setScreenTheme` and `setScreenLanguage` handlers |
| `api/src/index.ts` | Register two new PATCH routes |
| `app/src/api/client.js` | Export `setScreenTheme` and `setScreenLanguage` |
| `app/src/context/MeetingContext.jsx` | Add `screenTheme`/`screenLanguage` state, SSE handlers, context exposure |
| `app/src/views/Facilitate.jsx` | Add day/night toggle button; add language→screen propagation effect |
| `app/src/locales/en.json` | Add `facilitate.screen_theme_toggle` |
| `app/src/locales/nl.json` | Add `facilitate.screen_theme_toggle` |
| `app/src/components/charts/chartUtils.js` | Export `CHART_COLORS_NIGHT` and `CHART_COLORS_DAY` |
| `app/src/components/charts/VoteBar.jsx` | Accept `colors` prop; remove hardcoded COLORS |
| `app/src/components/charts/VotePie.jsx` | Accept `colors` prop; fix SVG crop |
| `app/src/components/charts/VoteBubbles.jsx` | Accept `colors` prop; remove hardcoded COLORS |
| `app/src/views/Display.jsx` | Full redesign: theme system, language sync, greeting fix, full-width voting, logo header, remove voting_open label |

---

## Task 1: MeetingService — screen theme & language state

**Files:**
- Modify: `api/src/services/MeetingService.ts`

**Context:** `MeetingService` already has `displayModes = new Map<string, string>()` with `setDisplayMode`/`getDisplayMode`. Follow the exact same pattern for the two new Maps. Defaults: theme `'day'`, language `'nl'`.

- [ ] **Step 1: Add the two new Maps and their getters/setters**

In `api/src/services/MeetingService.ts`, after line 7 (`private displayModes = new Map<string, string>()`), add:

```typescript
private screenThemes    = new Map<string, 'day' | 'night'>()
private screenLanguages = new Map<string, string>()

setScreenTheme(meetingId: string, theme: 'day' | 'night'): void {
    this.screenThemes.set(meetingId, theme)
}

getScreenTheme(meetingId: string): 'day' | 'night' {
    return this.screenThemes.get(meetingId) ?? 'day'
}

setScreenLanguage(meetingId: string, language: string): void {
    this.screenLanguages.set(meetingId, language)
}

getScreenLanguage(meetingId: string): string {
    return this.screenLanguages.get(meetingId) ?? 'nl'
}
```

- [ ] **Step 2: Clear both Maps on archive and reopen**

In `transitionStatus` (line 101), change:
```typescript
if (status === 'archived') this.displayModes.delete(id)
```
to:
```typescript
if (status === 'archived') {
    this.displayModes.delete(id)
    this.screenThemes.delete(id)
    this.screenLanguages.delete(id)
}
```

In `reopen` (line 119), change:
```typescript
this.displayModes.delete(id)
```
to:
```typescript
this.displayModes.delete(id)
this.screenThemes.delete(id)
this.screenLanguages.delete(id)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/MeetingService.ts
git commit -m "feat: add screen theme and language state to MeetingService"
```

---

## Task 2: MeetingController — new handlers + routes

**Files:**
- Modify: `api/src/controllers/MeetingController.ts`
- Modify: `api/src/index.ts`

**Context:** `setDisplayMode` handler (lines 99–116) is the exact pattern to follow. The closing `}` of the class is at line 117.

- [ ] **Step 1: Add `setScreenTheme` handler**

In `api/src/controllers/MeetingController.ts`, before the closing `}` of the class (line 117), add:

```typescript
setScreenTheme = async (req: Request, res: Response) => {
    try {
        const { theme } = req.body
        if (!['day', 'night'].includes(theme)) {
            return res.status(400).json({ error: 'Invalid theme. Must be day or night' })
        }
        const meeting = await svc.findById(req.params.id)
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' })
        }
        svc.setScreenTheme(req.params.id, theme)
        sseService.emit(req.params.id, 'screen_theme', { theme })
        res.json({ theme })
    } catch (e: any) {
        res.status(500).json({ error: e.message })
    }
}

setScreenLanguage = async (req: Request, res: Response) => {
    try {
        const { language } = req.body
        if (!['en', 'nl'].includes(language)) {
            return res.status(400).json({ error: 'Invalid language. Must be en or nl' })
        }
        const meeting = await svc.findById(req.params.id)
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' })
        }
        svc.setScreenLanguage(req.params.id, language)
        sseService.emit(req.params.id, 'screen_language', { language })
        res.json({ language })
    } catch (e: any) {
        res.status(500).json({ error: e.message })
    }
}
```

- [ ] **Step 2: Register the routes in index.ts**

In `api/src/index.ts`, after the existing line:
```typescript
app.patch("/api/meetings/:id/display-mode", requireAuth, requireFacilitatorOfMeeting, meeting.setDisplayMode);
```
Add:
```typescript
app.patch("/api/meetings/:id/screen-theme",    requireAuth, requireFacilitatorOfMeeting, meeting.setScreenTheme);
app.patch("/api/meetings/:id/screen-language", requireAuth, requireFacilitatorOfMeeting, meeting.setScreenLanguage);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test the endpoints**

Start the API if not running: `cd api && npm run dev`

```bash
# Replace TOKEN and MEETING_ID with real values from your dev session
curl -s -X PATCH http://localhost:3001/api/meetings/MEETING_ID/screen-theme \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"theme":"night"}' | cat
# Expected: {"theme":"night"}

curl -s -X PATCH http://localhost:3001/api/meetings/MEETING_ID/screen-language \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"en"}' | cat
# Expected: {"language":"en"}
```

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/controllers/MeetingController.ts api/src/index.ts
git commit -m "feat: add screen-theme and screen-language endpoints"
```

---

## Task 3: Frontend — API client + MeetingContext

**Files:**
- Modify: `app/src/api/client.js`
- Modify: `app/src/context/MeetingContext.jsx`

**Context:** `client.js` already exports `setDisplayMode = (id, mode) => req('PATCH', ...)`. `MeetingContext.jsx` has `displayMode` state at line 90, SSE handler at lines 135–138, reset in `setMeetingId` at line 127, and context value exposure at line 286.

- [ ] **Step 1: Add API client exports**

In `app/src/api/client.js`, alongside the existing `setDisplayMode` export, add:

```js
export const setScreenTheme    = (id, theme)    => req('PATCH', `/meetings/${id}/screen-theme`,    { theme })
export const setScreenLanguage = (id, language) => req('PATCH', `/meetings/${id}/screen-language`, { language })
```

- [ ] **Step 2: Add screenTheme and screenLanguage state in MeetingContext**

In `app/src/context/MeetingContext.jsx`, after line 90 (`const [displayMode, setDisplayMode] = useState('numbers')`), add:

```jsx
const [screenTheme,    setScreenTheme]    = useState('day')
const [screenLanguage, setScreenLanguage] = useState('nl')
```

- [ ] **Step 3: Handle new SSE events**

In `app/src/context/MeetingContext.jsx`, the SSE handler block (lines 135–138) currently reads:

```jsx
if (event.event === 'display_mode') {
  if (VALID_MODES.includes(event.mode)) setDisplayMode(event.mode)
  return
}
```

Add two more handlers immediately after the `display_mode` block (before `load(id)`):

```jsx
if (event.event === 'screen_theme') {
  if (['day', 'night'].includes(event.theme)) setScreenTheme(event.theme)
  return
}
if (event.event === 'screen_language') {
  if (['en', 'nl'].includes(event.language)) setScreenLanguage(event.language)
  return
}
```

- [ ] **Step 4: Reset new state when switching meetings**

In `app/src/context/MeetingContext.jsx`, line 127 currently reads:

```jsx
setDisplayMode('numbers')  // reset for the new meeting
```

Change to:

```jsx
setDisplayMode('numbers')
setScreenTheme('day')
setScreenLanguage('nl')
```

- [ ] **Step 5: Expose in context value**

In `app/src/context/MeetingContext.jsx`, find the context value object (line 286 area, where `displayMode,` appears). Add `screenTheme` and `screenLanguage` to that object:

```jsx
displayMode,
screenTheme,
screenLanguage,
```

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/api/client.js app/src/context/MeetingContext.jsx
git commit -m "feat: add screenTheme and screenLanguage to context and API client"
```

---

## Task 4: Facilitate.jsx — day/night toggle + language propagation

**Files:**
- Modify: `app/src/views/Facilitate.jsx`
- Modify: `app/src/locales/en.json`
- Modify: `app/src/locales/nl.json`

**Context:** The attendance bar buttons row is at line 161 (`<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>`) and contains the `open_display` link at lines 167–174. The day/night button goes inside this same flex row, right after the `open_display` link. The viz toolbar (lines ~330–365) already shows `displayMode` and calls `apiSetDisplayMode` — follow the same import alias pattern.

- [ ] **Step 1: Add i18n keys**

In `app/src/locales/en.json`, inside the `"facilitate"` object, after `"viz_mode_bubbles": "Bubbles"`, add:

```json
"screen_theme_day": "☀️ Day",
"screen_theme_night": "🌙 Night"
```

In `app/src/locales/nl.json`, inside the `"facilitate"` object, after `"viz_mode_bubbles": "Bellen"`, add:

```json
"screen_theme_day": "☀️ Dag",
"screen_theme_night": "🌙 Nacht"
```

- [ ] **Step 2: Update imports in Facilitate.jsx**

Change line 9 from:

```jsx
import { reopenMeeting, setDisplayMode as apiSetDisplayMode } from '../api/client'
```

to:

```jsx
import { reopenMeeting, setDisplayMode as apiSetDisplayMode, setScreenTheme as apiSetScreenTheme, setScreenLanguage as apiSetScreenLanguage } from '../api/client'
```

- [ ] **Step 3: Destructure screenTheme from useMeeting**

Change the `useMeeting()` destructuring (lines 13–19) to include `screenTheme`:

```jsx
const { setMeetingId,
  meeting, activePoll, attendeeCount,
  displayMode, screenTheme,
  updatePhase, addPoll, updatePoll, deletePoll,
  startPoll, closePoll, addManualVote, checkIn,
  addMandate, revokeMandate, removeAttendee,
} = useMeeting()
```

- [ ] **Step 4: Add language→screen propagation effect**

After the existing `useEffect(() => { setMeetingId(id) }, [id])` at line 49, add:

```jsx
const { i18n } = useTranslation()
useEffect(() => {
  if (meeting?.phase === 'in_session' && meeting?.id) {
    apiSetScreenLanguage(meeting.id, i18n.language).catch(console.error)
  }
}, [i18n.language, meeting?.id, meeting?.phase])
```

Note: `useTranslation` is already imported at line 6. The `i18n` object needs to be destructured from it. Change the existing line 21:

```jsx
const { t } = useTranslation()
```

to:

```jsx
const { t, i18n } = useTranslation()
```

- [ ] **Step 5: Add day/night toggle button**

In the attendance bar buttons flex row (line 161), after the closing `</a>` of the `open_display` link (line 174) and before the `{meeting.phase === 'in_session' && !confirmCloseMeeting &&` block (line 175), add:

```jsx
<button
  onClick={() => apiSetScreenTheme(meeting.id, screenTheme === 'day' ? 'night' : 'day').catch(console.error)}
  style={{
    background: 'transparent',
    border: '1px solid var(--color-charcoal-light)',
    color: 'var(--color-charcoal)',
    borderRadius: 8,
    padding: '9px 20px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
  }}
>
  {screenTheme === 'day' ? t('facilitate.screen_theme_night') : t('facilitate.screen_theme_day')}
</button>
```

- [ ] **Step 6: Verify in browser**

Start both API and frontend. Open a meeting as facilitator. Verify:
1. The day/night toggle button appears in the attendance bar row.
2. Clicking it calls `PATCH /api/meetings/:id/screen-theme` (check Network tab).
3. When meeting is in session, switching language in the profile menu triggers `PATCH /api/meetings/:id/screen-language`.

- [ ] **Step 7: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Facilitate.jsx app/src/locales/en.json app/src/locales/nl.json
git commit -m "feat: add day/night toggle and language propagation to Facilitate"
```

---

## Task 5: Chart palette — chartUtils + VoteBar + VotePie + VoteBubbles

**Files:**
- Modify: `app/src/components/charts/chartUtils.js`
- Modify: `app/src/components/charts/VoteBar.jsx`
- Modify: `app/src/components/charts/VotePie.jsx`
- Modify: `app/src/components/charts/VoteBubbles.jsx`

**Context:** All three chart components import `tallyVotes` from `./chartUtils`. Each has a hardcoded top-level `const COLORS = [...]`. The plan is: add palette constants to chartUtils, remove hardcoded COLORS from each chart, accept a `colors` prop (default `CHART_COLORS_NIGHT`).

VoteBar also has theme-sensitive non-color styles (label color, bar track color) that are currently hardcoded for dark mode — these stay dark-mode-hardcoded for now since Display.jsx manages the surrounding background; the charts themselves always render on whatever background Display provides.

- [ ] **Step 1: Add palette constants to chartUtils.js**

Replace the entire contents of `app/src/components/charts/chartUtils.js` with:

```js
/**
 * Tally votes from an adapted poll object.
 * poll.votes = { voterName: option_id, ... }  (adapted in MeetingContext — values are option IDs)
 * poll.options = ['Voor', 'Tegen', 'Onthouding']  (label strings, parallel array with _optionIds)
 * poll._optionIds = ['voor', 'tegen', 'onthouding']  (id strings, parallel array with options)
 * Returns { optionLabel: count } for all options.
 *
 * Note: on-behalf-of (mandate) votes are excluded from poll.votes by the adapter.
 * They have no per-option breakdown, so the tally reflects direct votes only.
 */
export function tallyVotes(poll) {
  const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
  for (const optionId of Object.values(poll.votes ?? {})) {
    const idx = poll._optionIds?.indexOf(optionId)
    if (idx != null && idx !== -1) tally[poll.options[idx]]++
  }
  return tally
}

// Chart color palettes — use NIGHT on dark backgrounds, DAY on light backgrounds
export const CHART_COLORS_NIGHT = ['#E8C27A', '#6BBFCC', '#9BCB8A', '#E08888', '#9B8FCC']
export const CHART_COLORS_DAY   = ['#C4A040', '#3A9AAA', '#5A9B60', '#C05A5A', '#6B5EAA']
```

- [ ] **Step 2: Update VoteBar.jsx**

Replace the entire file `app/src/components/charts/VoteBar.jsx` with:

```jsx
// app/src/components/charts/VoteBar.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

export default function VoteBar({ poll, colors = CHART_COLORS_NIGHT }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const max = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {entries.map(([label, count], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 110, textAlign: 'right', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 36, background: 'rgba(255,255,255,0.07)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.round((count / max) * 100)}%`,
              background: colors[i] ?? colors[colors.length - 1],
              borderRadius: 7,
              display: 'flex', alignItems: 'center', paddingLeft: 10,
              fontSize: '0.9rem', fontWeight: 700, color: 'white',
              transition: 'width 0.5s ease',
              minWidth: count > 0 ? 36 : 0,
            }}>
              {count > 0 ? count : ''}
            </div>
          </div>
          <span style={{ width: 28, textAlign: 'right', fontSize: '0.95rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', flexShrink: 0 }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update VotePie.jsx (palette prop + crop fix)**

Replace the entire file `app/src/components/charts/VotePie.jsx` with:

```jsx
// app/src/components/charts/VotePie.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

const R = 14        // circle radius
const CX = 16       // centre x
const CY = 16       // centre y
const CIRCUMFERENCE = 2 * Math.PI * R  // ~87.96

/**
 * Compute SVG stroke-dasharray segments for a donut chart.
 * Each segment: stroke-dasharray="sliceLen remainingLen", stroke-dashoffset="-offsetSoFar"
 * We rotate the SVG -90deg so segments start at 12 o'clock.
 */
function buildSegments(entries, total, colors) {
  let offset = 0
  return entries.map(([label, count], i) => {
    const slice = total > 0 ? (count / total) * CIRCUMFERENCE : 0
    const seg = { label, count, slice, offset, color: colors[i] ?? colors[colors.length - 1] }
    offset += slice
    return seg
  })
}

export default function VotePie({ poll, colors = CHART_COLORS_NIGHT }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  const segments = buildSegments(entries, total, colors)
  const maxCount = Math.max(...Object.values(tally))
  const winners = Object.values(tally).filter(c => c === maxCount)
  const isTie = total > 0 && winners.length > 1
  const leadingPct = total > 0 && !isTie ? Math.round((maxCount / total) * 100) : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0 }}>
        <svg width="130" height="130" viewBox="0 0 32 32"
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          {segments.map(seg => (
            <circle
              key={seg.label}
              r={R} cx={CX} cy={CY}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={6}
              strokeDasharray={`${seg.slice.toFixed(2)} ${(CIRCUMFERENCE - seg.slice).toFixed(2)}`}
              strokeDashoffset={`-${seg.offset.toFixed(2)}`}
            />
          ))}
          {/* Centre label — counter-rotate to stay upright */}
          <text
            x={CX} y={CY + 1.8}
            textAnchor="middle"
            fill="white"
            fontSize="5"
            fontWeight="700"
            style={{ transform: `rotate(90deg)`, transformOrigin: `${CX}px ${CY}px` }}
          >
            {leadingPct !== null ? `${leadingPct}%` : '='}
          </text>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: colors[i] ?? colors[colors.length - 1], flexShrink: 0 }} />
            <span>{label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'white', paddingLeft: 16 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Key crop fix: wrap SVG in `<div style={{ width: 130, height: 130 }}>` and add `overflow: 'visible'` to the SVG element. Previously the SVG had no enclosing div with explicit height, and `overflow` defaulted to `hidden`.

- [ ] **Step 4: Update VoteBubbles.jsx**

Replace the entire file `app/src/components/charts/VoteBubbles.jsx` with:

```jsx
// app/src/components/charts/VoteBubbles.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

const MAX_RADIUS = 100  // px, largest possible bubble diameter
const MIN_RADIUS = 32   // px, minimum so even 0-vote options are visible

export default function VoteBubbles({ poll, colors = CHART_COLORS_NIGHT }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const maxCount = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
      {entries.map(([label, count], i) => {
        const ratio = count / maxCount
        const diameter = Math.max(MIN_RADIUS, Math.round(MAX_RADIUS * Math.sqrt(ratio)))
        const fontSize = diameter > 70 ? '2rem' : diameter > 48 ? '1.3rem' : '0.9rem'

        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              background: colors[i] ?? colors[colors.length - 1],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize,
              transition: 'width 0.4s ease, height 0.4s ease',
              flexShrink: 0,
            }}>
              {count}
            </div>
            <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Verify charts render in browser**

Open a meeting in session with an active poll. Switch between Bars, Pie, Bubbles display modes on the facilitator screen. Verify:
1. All three chart types render without errors.
2. Colors match the new gold/teal/sage/coral/violet palette.
3. Pie chart is no longer cropped at top or bottom.

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/components/charts/chartUtils.js \
        app/src/components/charts/VoteBar.jsx \
        app/src/components/charts/VotePie.jsx \
        app/src/components/charts/VoteBubbles.jsx
git commit -m "feat: theme-aware chart color palette with colors prop"
```

---

## Task 6: Display.jsx — full redesign

**Files:**
- Modify: `app/src/views/Display.jsx`

**Context:** The current Display.jsx is 402 lines. This task rewrites the entire file. Read it first before making changes. Key structural notes:
- `CheckinDisplay` (line 148) has a `dark` prop and `c` color token object — it already handles day/night fully, just always passed `dark={false}` currently.
- `VotingDisplay` (line 270) is the main redesign target: full width, logo header, remove `voting_open` label, pass `colors` to charts.
- `BetweenItems` (line 355) and `ClosedDisplay` (line 375) use hardcoded `rgba(255,255,255,...)` colors — update to use theme.
- The `LanguageSwitcher` JSX block is at lines 129–131.
- Greeting bug: `prevCheckedIn = useRef(0)` at line 24 — change to `useRef(null)`.

- [ ] **Step 1: Update imports and destructuring**

Change the top of `Display.jsx` (lines 1–17):

```jsx
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useMeeting, getGreeting } from '../context/MeetingContext'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCommunity } from '../context/CommunityContext'
import AgendaHtml from '../components/AgendaHtml'
import VoteBar     from '../components/charts/VoteBar'
import VotePie     from '../components/charts/VotePie'
import VoteBubbles from '../components/charts/VoteBubbles'
import { CHART_COLORS_NIGHT, CHART_COLORS_DAY } from '../components/charts/chartUtils'
```

(Remove `import { LanguageSwitcher } from '../components/LanguageSwitcher'`.)

- [ ] **Step 2: Update Display() function — top section**

Replace the `Display()` function body from line 14 to the end of the destructuring + hooks block (ending before the `if (!meeting)` guard). The new version:

```jsx
export default function Display() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, sseConnected, setMeetingId, displayMode, screenTheme, screenLanguage } = useMeeting()
  const { community } = useCommunity() || {}
  const { t, i18n } = useTranslation()

  useEffect(() => { setMeetingId(id) }, [id])

  // Propagate facilitator's language selection to this tab
  useEffect(() => {
    if (screenLanguage) i18n.changeLanguage(screenLanguage)
  }, [screenLanguage])

  const [greeting, setGreeting] = useState(null)
  const [showGreeting, setShowGreeting] = useState(false)
  const [revealResult, setRevealResult] = useState(false)
  const prevCheckedIn = useRef(null)   // null = not yet initialized (prevents stale greeting on load)
  const prevActivePoll = useRef(null)
  const greetingTimer = useRef(null)

  // Detect new check-in — initialize silently on first render
  useEffect(() => {
    if (!meeting) return
    const cur = meeting.checkedIn.length
    if (prevCheckedIn.current === null) {
      prevCheckedIn.current = cur
      return
    }
    if (cur > prevCheckedIn.current) {
      const newest = meeting.checkedIn[meeting.checkedIn.length - 1]
      const g = getGreeting(newest.name.split(' ')[0])
      setGreeting(g)
      setShowGreeting(true)
      if (greetingTimer.current) clearTimeout(greetingTimer.current)
      greetingTimer.current = setTimeout(() => setShowGreeting(false), 3200)
    }
    prevCheckedIn.current = cur
  }, [meeting?.checkedIn])

  // Detect poll close -> reveal result
  useEffect(() => {
    if (!activePoll && prevActivePoll.current) {
      setRevealResult(true)
      setTimeout(() => setRevealResult(false), 8000)
    }
    prevActivePoll.current = activePoll?.id
  }, [activePoll])

  if (!meeting) return <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>

  const phase = meeting.phase
  const isCheckin = phase === 'open'
  const isSession = phase === 'in_session'
  const isClosed  = phase === 'archived'

  const isDark = screenTheme === 'night'
  const theme = isDark
    ? { bg: '#1A1612', text: 'white', muted: 'rgba(255,255,255,0.5)' }
    : { bg: 'var(--color-cream)', text: 'var(--color-charcoal)', muted: 'rgba(44,42,39,0.45)' }

  const chartColors = isDark ? CHART_COLORS_NIGHT : CHART_COLORS_DAY

  // Find most recently closed poll
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  const lastClosedPoll = closedPolls[closedPolls.length - 1]
```

- [ ] **Step 3: Update the root JSX return**

Replace the `return (...)` block of `Display()` (lines 63–146) with:

```jsx
  return (
    <div style={{
      minHeight: '100vh',
      background: theme.bg,
      color: theme.text,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Background texture — night mode only */}
      {isDark && <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 40%, rgba(196,98,45,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(212,136,74,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />}

      {/* Greeting flash */}
      {showGreeting && greeting && (
        <div
          className="greeting-flash"
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(196,98,45,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '5rem', marginBottom: 24 }}>👋</div>
          <div style={{ fontSize: '4rem', fontFamily: 'var(--font-title)', fontWeight: 600, textAlign: 'center', padding: '0 60px', lineHeight: 1.2 }}>
            {greeting}
          </div>
        </div>
      )}

      {/* Check-in phase */}
      {isCheckin && !showGreeting && (
        <CheckinDisplay meeting={meeting} attendeeCount={attendeeCount} community={community} meetingId={id} communitySlug={community?.slug} dark={isDark} />
      )}

      {/* Active vote */}
      {isSession && activePoll && !showGreeting && (
        <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} displayMode={displayMode} community={community} chartColors={chartColors} isDark={isDark} />
      )}

      {/* Result reveal */}
      {isSession && !activePoll && revealResult && lastClosedPoll?.result && !showGreeting && (
        <ResultDisplay poll={lastClosedPoll} community={community} isDark={isDark} />
      )}

      {/* Between agenda items */}
      {isSession && !activePoll && !revealResult && !showGreeting && (
        <BetweenItems meeting={meeting} attendeeCount={attendeeCount} community={community} isDark={isDark} />
      )}

      {/* Meeting closed */}
      {isClosed && !showGreeting && (
        <ClosedDisplay meeting={meeting} isDark={isDark} />
      )}

      {/* SSE reconnection indicator */}
      {!sseConnected && (
        <div style={{ position: 'absolute', top: 16, right: 24, background: 'rgba(245,158,11,0.9)', color: 'white', borderRadius: 6, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 500 }}>
          {t('common.reconnecting')}
        </div>
      )}

      {/* Bottom left brand tag */}
      <div style={{ position: 'absolute', bottom: 20, left: 32, opacity: 0.35, fontSize: '0.8rem', color: theme.text }}>
        🏛️ ALVer
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite VotingDisplay**

Replace the `VotingDisplay` function (lines 270–323) with:

```jsx
function VotingDisplay({ poll, attendeeCount, displayMode, community, chartColors, isDark }) {
  const { t } = useTranslation()
  const totalVotes = Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  const pct = attendeeCount > 0 ? Math.round((totalVotes / attendeeCount) * 100) : 0
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(44,42,39,0.45)'
  const trackColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(44,42,39,0.12)'

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0, animation: 'slideIn 0.4s ease' }}>
      {/* Header row: logo | poll title | vote count */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 32px',
        gap: 24,
      }}>
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" style={{ height: 48, maxWidth: 200, objectFit: 'contain' }} />
            : <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '1.3rem', color: textColor, opacity: 0.7 }}>🏛️ ALVer</div>
          }
        </div>
        {/* Poll title */}
        <h1 style={{
          fontFamily: 'var(--font-title)',
          fontSize: 'clamp(1.6rem, 3vw, 2.6rem)',
          fontWeight: 600,
          color: textColor,
          lineHeight: 1.2,
          margin: 0,
          textAlign: 'center',
          flex: 1,
        }}>
          {poll.title}
        </h1>
        {/* Vote count */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: textColor, lineHeight: 1 }}>{totalVotes}</div>
          <div style={{ fontSize: '0.8rem', color: mutedColor, marginTop: 2 }}>{t('display.of_total', { total: attendeeCount })}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ height: 8, background: trackColor, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, var(--color-terracotta), var(--color-amber))',
            width: `${pct}%`, transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ color: mutedColor, fontSize: '0.85rem', marginTop: 6, textAlign: 'right' }}>{pct}%</div>
      </div>

      {/* Chart area */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {displayMode === 'bars'    && <VoteBar     poll={poll} colors={chartColors} />}
        {displayMode === 'pie'     && <VotePie     poll={poll} colors={chartColors} />}
        {displayMode === 'bubbles' && <VoteBubbles poll={poll} colors={chartColors} />}
        {(displayMode === 'numbers' || !displayMode) && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {poll.options.map((opt, i) => (
              <span key={opt} style={{
                padding: '12px 32px', borderRadius: 10,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,42,39,0.07)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(44,42,39,0.12)'}`,
                fontSize: '1.2rem', color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--color-charcoal-light)',
              }}>{opt}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update ResultDisplay**

Replace the `ResultDisplay` function (lines 325–353) with:

```jsx
function ResultDisplay({ poll, community, isDark }) {
  const { t } = useTranslation()
  const [showBreakdown, setShowBreakdown] = useState(false)
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(44,42,39,0.45)'

  useEffect(() => {
    const timer = setTimeout(() => setShowBreakdown(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ width: '100%' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 32px', gap: 24 }}>
        <div style={{ flexShrink: 0 }}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" style={{ height: 48, maxWidth: 200, objectFit: 'contain' }} />
            : <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '1.3rem', color: textColor, opacity: 0.7 }}>🏛️ ALVer</div>
          }
        </div>
        <p style={{ color: mutedColor, margin: 0, fontSize: '1rem', flex: 1, textAlign: 'center' }}>{poll.title}</p>
        <div style={{ width: 200, flexShrink: 0 }} />
      </div>

      {showBreakdown && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', gap: 56, flexWrap: 'wrap' }}>
          {Object.entries(poll.result.tally).map(([opt, count]) => (
            <div key={opt} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', fontWeight: 700, color: textColor, lineHeight: 1 }}>{count}</div>
              <div style={{ color: mutedColor, fontSize: '1rem', marginTop: 8 }}>{opt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Update BetweenItems**

Replace the `BetweenItems` function (lines 355–373) with:

```jsx
function BetweenItems({ meeting, attendeeCount, community, isDark }) {
  const { t } = useTranslation()
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(44,42,39,0.45)'
  const amberColor = isDark ? 'var(--color-amber)' : 'var(--color-terracotta)'

  return (
    <div style={{ textAlign: 'center', maxWidth: 800 }}>
      {community?.logo_url && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <img src={community.logo_url} alt="logo" style={{ height: 56, maxWidth: 240, objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ fontSize: '1rem', color: mutedColor, marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {meeting.name}
      </div>
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '3rem', color: textColor, margin: '0 0 40px' }}>
        {t('display.session_ongoing')}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
        <div>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: amberColor, lineHeight: 1 }}>{attendeeCount}</div>
          <div style={{ color: mutedColor, fontSize: '0.9rem', marginTop: 6 }}>{t('display.eligible')}</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update ClosedDisplay**

Replace the `ClosedDisplay` function (lines 375–400) with:

```jsx
function ClosedDisplay({ meeting, isDark }) {
  const { t } = useTranslation()
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(44,42,39,0.45)'
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(44,42,39,0.05)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,42,39,0.1)'
  const closedPolls = meeting.polls.filter(p => p.status === 'closed' && p.result)

  return (
    <div style={{ textAlign: 'center', maxWidth: 800, width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '2.5rem', color: textColor, margin: '0 0 12px' }}>
        {t('display.meeting_closed')}
      </h1>
      <p style={{ color: mutedColor, margin: '0 0 40px' }}>{meeting.name}</p>
      {closedPolls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {closedPolls.map(poll => (
            <div key={poll.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 24px',
              background: cardBg, borderRadius: 10,
              border: `1px solid ${cardBorder}`,
            }}>
              <span style={{ fontSize: '0.9rem', color: mutedColor, textAlign: 'left', flex: 1 }}>{poll.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Remove voting_open from locale files**

The `display.voting_open` key is now unused. Remove it from both locale files to keep them clean.

In `app/src/locales/en.json`, remove the line:
```json
"voting_open": "🗳️ Poll open",
```

In `app/src/locales/nl.json`, remove the equivalent line (search for `voting_open`).

- [ ] **Step 9: End-to-end verification**

Open a meeting in the Display tab and the Facilitate tab side by side. Verify:

1. **Greeting bug**: Refresh Display tab mid-meeting (attendees already present). No greeting flash on load. Then have someone check in — greeting fires correctly.
2. **Day/Night toggle**: Click the toggle in Facilitate. Display background switches immediately (day = cream, night = dark `#1A1612`). Toggle back — switches again.
3. **Language propagation**: Change language in the profile menu while meeting is in session. Display tab language switches within 1–2 seconds (via SSE).
4. **Check-in phase in night mode**: Switch to night, observe check-in screen — QR code, stats, agenda all visible with correct colors.
5. **Voting — full width**: Start a poll. VotingDisplay fills the full viewport width. Logo appears in header row. Poll title is centered. Vote count is top-right. No "Poll open" label.
6. **Voting — all chart modes**: Switch through Numbers/Bars/Pie/Bubbles from facilitator. Each renders correctly with new palette colors.
7. **Pie chart**: No cropping top or bottom.
8. **Result reveal**: Close a poll. Result display appears with logo header.

- [ ] **Step 10: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Display.jsx app/src/locales/en.json app/src/locales/nl.json
git commit -m "feat: Display screen redesign — theme, language sync, full-width voting, logo header, bug fixes"
```
