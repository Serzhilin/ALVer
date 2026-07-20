# Vote Visualization Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new vote visualization modes (Bars, Pie, Bubbles) to the projector screen, switchable live from the facilitator's Polls tab toolbar.

**Architecture:** A new `PATCH /api/meetings/:id/display-mode` endpoint stores the selected mode in an in-memory map in `MeetingService` and broadcasts a `display_mode` SSE event. `MeetingContext` handles the event and exposes `displayMode` state. `Display.jsx` passes it to `VotingDisplay` which delegates to one of four renderer components. `Facilitate.jsx` renders a segmented toolbar above the polls list.

**Tech Stack:** React (JSX), TypeScript (Express API), SSE via existing `sseService`, pure SVG for charts (no external chart library).

---

## File Structure

**New files:**
- `app/src/components/charts/chartUtils.js` — `tallyVotes(poll)` shared helper
- `app/src/components/charts/VoteBar.jsx` — horizontal bars renderer
- `app/src/components/charts/VotePie.jsx` — SVG donut chart renderer
- `app/src/components/charts/VoteBubbles.jsx` — proportional circles renderer

**Modified files:**
- `api/src/services/MeetingService.ts` — in-memory display mode map + `setDisplayMode` / `getDisplayMode`
- `api/src/controllers/MeetingController.ts` — `setDisplayMode` handler
- `api/src/index.ts` — new route
- `app/src/api/client.js` — `setDisplayMode` API call
- `app/src/context/MeetingContext.jsx` — `displayMode` state + SSE handler + context value
- `app/src/views/Facilitate.jsx` — viz toolbar above polls list
- `app/src/views/Display.jsx` — pass `displayMode` to `VotingDisplay`, wire up renderers

---

## Task 1: `tallyVotes` shared utility

**Files:**
- Create: `app/src/components/charts/chartUtils.js`

- [ ] **Step 1: Create the file**

```js
// app/src/components/charts/chartUtils.js

/**
 * Tally votes from an adapted poll object.
 * poll.votes = { voterName: optionLabel, ... }  (already adapted in MeetingContext)
 * poll.options = ['Voor', 'Tegen', 'Onthouding']  (label strings)
 * Returns { optionLabel: count } for all options.
 */
export function tallyVotes(poll) {
  const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
  for (const optionLabel of Object.values(poll.votes ?? {})) {
    if (optionLabel in tally) tally[optionLabel]++
  }
  // Also count on-behalf-of votes (onBehalfVoters is a Set of granter names,
  // but their votes are already in poll.votes keyed by the proxy's name —
  // so no double-counting needed here)
  return tally
}
```

- [ ] **Step 2: Verify manually**

Open a browser console and confirm logic: given `poll.votes = { Alice: 'Voor', Bob: 'Tegen', Carol: 'Voor' }` and `poll.options = ['Voor', 'Tegen', 'Onthouding']`, `tallyVotes(poll)` returns `{ Voor: 2, Tegen: 1, Onthouding: 0 }`.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/charts/chartUtils.js
git commit -m "feat: add tallyVotes chart utility"
```

---

## Task 2: VoteBar component

**Files:**
- Create: `app/src/components/charts/VoteBar.jsx`

- [ ] **Step 1: Create the component**

```jsx
// app/src/components/charts/VoteBar.jsx
import { tallyVotes } from './chartUtils'

const COLORS = [
  'linear-gradient(90deg, #C4622D, #D4884A)',
  'rgba(255,255,255,0.22)',
  'rgba(255,255,255,0.12)',
  'rgba(255,255,255,0.08)',
]

export default function VoteBar({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const max = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {entries.map(([label, count], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 90, textAlign: 'right', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 32, background: 'rgba(255,255,255,0.07)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.round((count / max) * 100)}%`,
              background: COLORS[i] ?? COLORS[COLORS.length - 1],
              borderRadius: 7,
              display: 'flex', alignItems: 'center', paddingLeft: 10,
              fontSize: '0.9rem', fontWeight: 700, color: 'white',
              transition: 'width 0.5s ease',
              minWidth: count > 0 ? 32 : 0,
            }}>
              {count > 0 ? count : ''}
            </div>
          </div>
          <span style={{ width: 24, textAlign: 'right', fontSize: '0.95rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', flexShrink: 0 }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/charts/VoteBar.jsx
git commit -m "feat: add VoteBar chart component"
```

---

## Task 3: VotePie component

**Files:**
- Create: `app/src/components/charts/VotePie.jsx`

- [ ] **Step 1: Create the component**

```jsx
// app/src/components/charts/VotePie.jsx
import { tallyVotes } from './chartUtils'

const COLORS = ['#C4622D', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.09)']
const R = 14        // circle radius
const CX = 16       // centre x
const CY = 16       // centre y
const CIRCUMFERENCE = 2 * Math.PI * R  // ~87.96

/**
 * Compute SVG stroke-dasharray segments for a donut chart.
 * Each segment: stroke-dasharray="sliceLen remainingLen", stroke-dashoffset="-offsetSoFar"
 * We rotate the SVG -90deg so segments start at 12 o'clock.
 */
function buildSegments(entries, total) {
  let offset = 0
  return entries.map(([label, count], i) => {
    const slice = total > 0 ? (count / total) * CIRCUMFERENCE : 0
    const seg = { label, count, slice, offset, color: COLORS[i] ?? COLORS[COLORS.length - 1] }
    offset += slice
    return seg
  })
}

export default function VotePie({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  const segments = buildSegments(entries, total)
  const leadingPct = total > 0 ? Math.round((Math.max(...Object.values(tally)) / total) * 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <svg width="130" height="130" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
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
          {leadingPct}%
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i] ?? COLORS[COLORS.length - 1], flexShrink: 0 }} />
            <span>{label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'white', paddingLeft: 16 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/charts/VotePie.jsx
git commit -m "feat: add VotePie donut chart component"
```

---

## Task 4: VoteBubbles component

**Files:**
- Create: `app/src/components/charts/VoteBubbles.jsx`

- [ ] **Step 1: Create the component**

```jsx
// app/src/components/charts/VoteBubbles.jsx
import { tallyVotes } from './chartUtils'

const MAX_RADIUS = 80   // px, largest possible bubble diameter
const MIN_RADIUS = 28   // px, minimum so even 0-vote options are visible
const COLORS = ['#C4622D', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.08)']

export default function VoteBubbles({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const maxCount = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
      {entries.map(([label, count], i) => {
        // Area proportional to count; sqrt so radius scales by sqrt(ratio)
        const ratio = count / maxCount
        const diameter = Math.max(MIN_RADIUS, Math.round(MAX_RADIUS * Math.sqrt(ratio)))
        const fontSize = diameter > 60 ? '1.8rem' : diameter > 40 ? '1.2rem' : '0.85rem'

        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              background: COLORS[i] ?? COLORS[COLORS.length - 1],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize,
              transition: 'width 0.4s ease, height 0.4s ease',
              flexShrink: 0,
            }}>
              {count}
            </div>
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/charts/VoteBubbles.jsx
git commit -m "feat: add VoteBubbles proportional circles component"
```

---

## Task 5: API — setDisplayMode endpoint

**Files:**
- Modify: `api/src/services/MeetingService.ts`
- Modify: `api/src/controllers/MeetingController.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Add in-memory map and methods to MeetingService**

In `api/src/services/MeetingService.ts`, add immediately after the `private repo` line (line 6):

```typescript
private displayModes = new Map<string, string>()

setDisplayMode(meetingId: string, mode: string): void {
    this.displayModes.set(meetingId, mode)
}

getDisplayMode(meetingId: string): string {
    return this.displayModes.get(meetingId) ?? 'numbers'
}
```

Also inside `transitionStatus`, after `sseService.emit(id, "meeting_status_changed", ...)` (around line 85), add:
```typescript
if (status === 'archived') this.displayModes.delete(id)
```

Also inside `reopen`, after `sseService.emit(id, "meeting_status_changed", ...)` (line 102), add:
```typescript
this.displayModes.delete(id)
```

- [ ] **Step 2: Add controller method to MeetingController**

In `api/src/controllers/MeetingController.ts`, add before the closing `}` of the class:

```typescript
setDisplayMode = async (req: Request, res: Response) => {
    try {
        const { mode } = req.body
        const valid = ['numbers', 'bars', 'pie', 'bubbles']
        if (!valid.includes(mode)) {
            return res.status(400).json({ error: 'Invalid mode. Must be one of: numbers, bars, pie, bubbles' })
        }
        svc.setDisplayMode(req.params.id, mode)
        sseService.emit(req.params.id, 'display_mode', { mode })
        res.json({ mode })
    } catch (e: any) {
        res.status(500).json({ error: e.message })
    }
}
```

- [ ] **Step 3: Register the route in index.ts**

In `api/src/index.ts`, add after the `reopen` route (after line 73):

```typescript
app.patch("/api/meetings/:id/display-mode", requireAuth, requireFacilitatorOfMeeting, meeting.setDisplayMode);
```

- [ ] **Step 4: Verify the API compiles**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/MeetingService.ts api/src/controllers/MeetingController.ts api/src/index.ts
git commit -m "feat: add display-mode endpoint with SSE broadcast"
```

---

## Task 6: Frontend API client + MeetingContext

**Files:**
- Modify: `app/src/api/client.js`
- Modify: `app/src/context/MeetingContext.jsx`

- [ ] **Step 1: Add setDisplayMode to client.js**

In `app/src/api/client.js`, add after the `reopenMeeting` line (after line 72):

```js
export const setDisplayMode = (id, mode) => req('PATCH', `/meetings/${id}/display-mode`, { mode })
```

- [ ] **Step 2: Add displayMode state and SSE handler to MeetingContext**

In `app/src/context/MeetingContext.jsx`:

**2a.** Add `displayMode` state after the existing `useState` calls (around line 88, after `const meetingId = useRef(null)`):

```jsx
const [displayMode, setDisplayMode] = useState('numbers')
```

**2b.** The SSE subscription currently calls `load(id)` on every event. Add a specific handler for `display_mode` events **before** the full reload, so the display switches instantly without a network round-trip. Replace the SSE subscription block (lines 131–137):

```jsx
unsubRef.current = api.subscribeToMeeting(id, (event) => {
  if (event.event === 'display_mode') {
    setDisplayMode(event.mode)
    return  // no need to reload the full meeting for a mode change
  }
  load(id)
}, {
  onDisconnect: () => setSseConnected(false),
  onReconnect: () => setSseConnected(true),
})
```

**2c.** Add `displayMode` to the context value object (inside the `<MeetingContext.Provider value={{...}}>`, after `removeAttendee`):

```jsx
displayMode,
```

- [ ] **Step 3: Commit**

```bash
git add app/src/api/client.js app/src/context/MeetingContext.jsx
git commit -m "feat: add displayMode state and SSE handler in MeetingContext"
```

---

## Task 7: Facilitate.jsx — visualization toolbar

**Files:**
- Modify: `app/src/views/Facilitate.jsx`

- [ ] **Step 1: Import setDisplayMode**

At the top of `app/src/views/Facilitate.jsx`, update the `reopenMeeting` import line (line 9):

```jsx
import { reopenMeeting, setDisplayMode } from '../api/client'
```

- [ ] **Step 2: Destructure displayMode from useMeeting**

Update the `useMeeting()` destructuring (lines 13–18) to add `displayMode`:

```jsx
const { setMeetingId,
  meeting, activePoll, attendeeCount,
  displayMode,
  updatePhase, addPoll, updatePoll, deletePoll,
  startPoll, closePoll, addManualVote, checkIn,
  addMandate, revokeMandate, removeAttendee,
} = useMeeting()
```

- [ ] **Step 3: Add the toolbar JSX**

In the Polls card section, find the line (around line 331):
```jsx
{/* Zone 3 — Polls */}
<div className="card" style={{ padding: 20 }}>
```

Add the toolbar immediately after the opening `<div className="card"` but only when `meeting.phase === 'in_session'`. Insert after the opening div tag, before the existing `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' ...`:

```jsx
{meeting.phase === 'in_session' && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--color-cream, #faf8f5)',
    border: '1px solid var(--color-sand, #e8e0d5)',
    borderRadius: 10, padding: 6, marginBottom: 16,
  }}>
    <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-charcoal-light)', padding: '0 4px', flexShrink: 0 }}>
      Screen
    </span>
    {[
      { key: 'numbers', label: 'Numbers', icon: '🔢' },
      { key: 'bars',    label: 'Bars',    icon: '📊' },
      { key: 'pie',     label: 'Pie',     icon: '🥧' },
      { key: 'bubbles', label: 'Bubbles', icon: '🫧' },
    ].map(m => (
      <button
        key={m.key}
        onClick={() => setDisplayMode(meeting.id, m.key)}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 5, padding: '7px 8px', borderRadius: 7,
          fontSize: '0.8rem', fontWeight: displayMode === m.key ? 700 : 500,
          color: displayMode === m.key ? 'var(--color-terracotta)' : 'var(--color-charcoal-light)',
          background: displayMode === m.key ? 'white' : 'transparent',
          border: 'none', cursor: 'pointer',
          boxShadow: displayMode === m.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
          transition: 'all 0.15s',
        }}
      >
        <span>{m.icon}</span> {m.label}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Facilitate.jsx
git commit -m "feat: add visualization mode toolbar to facilitator polls tab"
```

---

## Task 8: Display.jsx — wire up all four renderers

**Files:**
- Modify: `app/src/views/Display.jsx`

- [ ] **Step 1: Import chart components and displayMode**

At the top of `app/src/views/Display.jsx`, add imports after the existing imports:

```jsx
import VoteBar     from '../components/charts/VoteBar'
import VotePie     from '../components/charts/VotePie'
import VoteBubbles from '../components/charts/VoteBubbles'
```

Update the `useMeeting` destructuring (line 12):

```jsx
const { meeting, activePoll, attendeeCount, sseConnected, setMeetingId, displayMode } = useMeeting()
```

- [ ] **Step 2: Update VotingDisplay to accept and use displayMode**

Find `function VotingDisplay({ poll, attendeeCount })` (line 267) and replace the entire function with:

```jsx
function VotingDisplay({ poll, attendeeCount, displayMode }) {
  const { t } = useTranslation()
  const totalVotes = Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  const pct = attendeeCount > 0 ? Math.round((totalVotes / attendeeCount) * 100) : 0

  return (
    <div style={{ textAlign: 'center', maxWidth: 900, width: '100%', animation: 'slideIn 0.4s ease' }}>
      <div style={{ marginBottom: 16, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {t('display.voting_open')}
      </div>
      <h1 style={{
        fontFamily: 'var(--font-title)', fontSize: '2.4rem', fontWeight: 600,
        color: 'white', lineHeight: 1.3, margin: '0 0 40px',
      }}>
        {poll.title}
      </h1>

      {/* Progress indicator — shown in all modes */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-amber)', lineHeight: 1 }}>
          {totalVotes} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{t('display.of_total', { total: attendeeCount })}</span>
        </div>
        <div style={{ maxWidth: 400, margin: '12px auto 0' }}>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, var(--color-terracotta), var(--color-amber))',
              width: `${pct}%`, transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 6 }}>{pct}%</div>
        </div>
      </div>

      {/* Chart area — switches by displayMode */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {displayMode === 'bars'    && <VoteBar     poll={poll} attendeeCount={attendeeCount} />}
        {displayMode === 'pie'     && <VotePie     poll={poll} attendeeCount={attendeeCount} />}
        {displayMode === 'bubbles' && <VoteBubbles poll={poll} attendeeCount={attendeeCount} />}
        {(displayMode === 'numbers' || !displayMode) && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {poll.options.map(opt => (
              <span key={opt} style={{
                padding: '8px 24px', borderRadius: 8,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)',
              }}>{opt}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Pass displayMode to VotingDisplay**

Find the line that renders `<VotingDisplay` (around line 107):

```jsx
{isSession && activePoll && !showGreeting && (
  <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} />
)}
```

Update it to:

```jsx
{isSession && activePoll && !showGreeting && (
  <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} displayMode={displayMode} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Display.jsx
git commit -m "feat: wire up four visualization renderers in Display VotingDisplay"
```

---

## Task 9: End-to-end smoke test + push

- [ ] **Step 1: Start the dev environment**

```bash
cd /home/serzhilin/Projects/ALVer
# Terminal 1
cd api && npm run dev

# Terminal 2
cd app && npm run dev
```

- [ ] **Step 2: Test the flow**

1. Log in as facilitator, open a meeting in session
2. Open a second browser tab to the Display screen (`/:slug/meeting/:id/display`)
3. Start a poll on the facilitator screen
4. Verify the Display tab shows **Numbers** mode (default) with vote count
5. Tap **Bars** in the toolbar — Display tab should switch to horizontal bars immediately
6. Cast a vote — bars should animate wider in real time
7. Tap **Pie** — Display tab shows donut chart
8. Tap **Bubbles** — Display tab shows proportional circles
9. Tap **Numbers** — returns to original count view
10. Close the poll — result display shows as before (unchanged)

- [ ] **Step 3: Push**

```bash
git push origin main
```
