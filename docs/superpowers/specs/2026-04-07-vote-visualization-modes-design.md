# Vote Visualization Modes — Design Spec

## Goal

Allow the facilitator to switch the projector (Display tab) between four vote visualization modes — Numbers, Bars, Pie, Bubbles — live during an active poll.

## Background

The current `VotingDisplay` component in `Display.jsx` shows only a vote count and a progress bar. This spec adds three additional renderers and a toolbar in the facilitator screen to switch between them instantly.

---

## User Experience

### Facilitator screen

A segmented toolbar sits at the top of the **Polls tab**, always visible during a session:

```
Screen: [Numbers] [Bars] [Pie] [Bubbles]
```

- Tapping a mode highlights it and instantly updates the projector
- The toolbar is visible regardless of whether a poll is live (so the facilitator can pre-select a mode)
- Default mode on meeting open: **Numbers** (current behaviour)

### Display / projector screen

When a `display_mode` SSE event arrives, `VotingDisplay` switches renderer without any reload or flicker. The switch applies immediately — even mid-vote.

The four renderers all receive the same props: `poll`, `attendeeCount`. They show:

| Mode | What it shows |
|------|--------------|
| **Numbers** | Large vote count + progress bar (current) |
| **Bars** | Horizontal bar per option, proportional width, count label |
| **Pie** | SVG donut chart, leading % in centre, legend with counts |
| **Bubbles** | One circle per option, area proportional to count |

All renderers are dark-background (matching the existing Display screen style).

---

## Architecture

### Mode storage

Mode is stored **in-memory** on the API in a `Map<meetingId, DisplayMode>` inside `MeetingService`. It is:
- Initialised to `"numbers"` when a meeting transitions to `in_session`
- Reset to `"numbers"` when a meeting is closed or reopened
- Not persisted to the database — a page refresh on the Display tab will receive the current mode via the next SSE event (the facilitator simply taps the active button again if needed; this is acceptable)

`DisplayMode` type: `"numbers" | "bars" | "pie" | "bubbles"`

### API

**New route:**
```
PATCH /api/meetings/:id/display-mode
Body: { mode: "numbers" | "bars" | "pie" | "bubbles" }
Auth: requireAuth + requireFacilitatorOfMeeting
```

Controller:
1. Validates `mode` is one of the four values
2. Calls `meetingService.setDisplayMode(id, mode)` — updates in-memory map
3. Calls `sseService.emit(id, "display_mode", { mode })` — broadcasts to all Display clients
4. Returns `{ mode }` with 200

### SSE event

```json
{ "event": "display_mode", "mode": "bars" }
```

`MeetingContext` already handles incoming SSE events. Add `display_mode` case: set `displayMode` state.

### Frontend state

`MeetingContext` exposes:
- `displayMode: DisplayMode` — current mode, default `"numbers"`

`Facilitate.jsx` reads `displayMode` from context; toolbar highlights the active mode. On tap, calls `api.setDisplayMode(meetingId, mode)`.

`Display.jsx` reads `displayMode` from context; passes it to `VotingDisplay`.

---

## New Files

### `app/src/components/charts/VoteBar.jsx`

Props: `{ poll, attendeeCount }`

Horizontal bars. One row per option:
- Option name (left, fixed width)
- Bar track (flex, fills remaining space) with filled portion = `count / max(counts)`
- Count label (right)

Winning option uses terracotta gradient; others use dim white.

### `app/src/components/charts/VotePie.jsx`

Props: `{ poll, attendeeCount }`

Pure SVG donut chart (no external library). Segments computed from `poll.result?.tally` if closed, or current `poll.votes` tally if open. Centre shows percentage of leading option. Legend below/beside with colour swatches and counts.

Colours: terracotta for first option (typically "For"), dim whites for remaining.

### `app/src/components/charts/VoteBubbles.jsx`

Props: `{ poll, attendeeCount }`

One `<div>` circle per option. Radius = `sqrt(count / totalVotes) * MAX_RADIUS`. Circles aligned horizontally, baseline-aligned. Option name below each circle, count inside. Winning circle uses terracotta, others dim white variants.

---

## Changed Files

### `app/src/api/client.js`

Add:
```js
export const setDisplayMode = (id, mode) => req('PATCH', `/meetings/${id}/display-mode`, { mode })
```

### `app/src/context/MeetingContext.jsx`

- Add `displayMode` state, default `"numbers"`
- In SSE event handler, add case for `event === "display_mode"`: `setDisplayMode(payload.mode)`
- Expose `displayMode` in context value

### `app/src/views/Facilitate.jsx`

- Import `setDisplayMode` from api/client
- Import `displayMode` from `useMeeting()`
- Add toolbar above the polls list (visible when `meeting.phase === 'in_session'`):

```jsx
const MODES = [
  { key: 'numbers', label: 'Numbers', icon: <NumbersIcon /> },
  { key: 'bars',    label: 'Bars',    icon: <BarsIcon /> },
  { key: 'pie',     label: 'Pie',     icon: <PieIcon /> },
  { key: 'bubbles', label: 'Bubbles', icon: <BubblesIcon /> },
]

<div className="viz-toolbar">
  <span>Screen:</span>
  {MODES.map(m => (
    <button
      key={m.key}
      className={displayMode === m.key ? 'active' : ''}
      onClick={() => setDisplayMode(meeting.id, m.key)}
    >
      {m.icon} {m.label}
    </button>
  ))}
</div>
```

Icons are inline SVGs (no icon library dependency), same as the mockup.

### `app/src/views/Display.jsx`

`VotingDisplay` receives `displayMode` prop. Switches renderer:

```jsx
import VoteBar     from '../components/charts/VoteBar'
import VotePie     from '../components/charts/VotePie'
import VoteBubbles from '../components/charts/VoteBubbles'

function VotingDisplay({ poll, attendeeCount, displayMode }) {
  // ... existing title + progress bar stays at top ...
  const renderers = {
    numbers: <NumbersRenderer poll={poll} attendeeCount={attendeeCount} />,
    bars:    <VoteBar    poll={poll} attendeeCount={attendeeCount} />,
    pie:     <VotePie    poll={poll} attendeeCount={attendeeCount} />,
    bubbles: <VoteBubbles poll={poll} attendeeCount={attendeeCount} />,
  }
  return (
    <div ...>
      {/* poll title, progress bar */}
      {renderers[displayMode] ?? renderers.numbers}
    </div>
  )
}
```

The existing vote count + progress bar (top of `VotingDisplay`) stays in all modes as a secondary indicator — the chart renders below it.

### `api/src/controllers/MeetingController.ts`

Add `setDisplayMode` method:
```typescript
setDisplayMode = async (req: Request, res: Response) => {
    const { mode } = req.body
    const valid = ['numbers', 'bars', 'pie', 'bubbles']
    if (!valid.includes(mode)) return res.status(400).json({ error: 'Invalid mode' })
    svc.setDisplayMode(req.params.id, mode)
    sseService.emit(req.params.id, 'display_mode', { mode })
    res.json({ mode })
}
```

### `api/src/services/MeetingService.ts`

Add in-memory map and methods:
```typescript
private displayModes = new Map<string, string>()

setDisplayMode(meetingId: string, mode: string) {
    this.displayModes.set(meetingId, mode)
}

getDisplayMode(meetingId: string): string {
    return this.displayModes.get(meetingId) ?? 'numbers'
}
```

Reset to `"numbers"` inside `transitionStatus` when transitioning to `archived`, and inside `reopen`.

### `api/src/index.ts`

Add route:
```typescript
app.patch('/api/meetings/:id/display-mode', requireAuth, requireFacilitatorOfMeeting, meeting.setDisplayMode)
```

---

## Vote data during open poll

During an open poll, `poll.votes` is a `Record<voterName, optionId>`. The charts need `{ optionLabel: count }`. A helper `tallyVotes(poll)` computes this:

```typescript
function tallyVotes(poll) {
  const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
  for (const optionId of Object.values(poll.votes)) {
    const opt = poll.options.find(o => o === optionId) // options are label strings
    if (opt) tally[opt]++
  }
  return tally // { "For": 14, "Against": 4, "Abstain": 3 }
}
```

All three chart components use this same helper (defined once in a shared `chartUtils.js`).

---

## Styling

All chart components follow the existing Display screen dark theme:
- Background: `#1A1612`
- Primary colour: `var(--color-terracotta)` / `var(--color-amber)`
- Secondary: `rgba(255,255,255,0.18)`
- Muted: `rgba(255,255,255,0.10)`
- Text: `white` / `rgba(255,255,255,0.6)`

Toolbar on facilitator screen uses the existing `.card` / button styles; active state uses terracotta.

---

## Out of scope

- Persisting the selected mode to the database
- Per-poll mode memory (mode is meeting-wide)
- Animation transitions between modes (plain re-render is fine)
- Custom colour themes per option
