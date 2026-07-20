# Polls Visibility & Drag-and-Drop Reorder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show upcoming polls to non-aspirant attendees during pre-registration and check-in, and let the facilitator reorder polls via drag-and-drop with persistent sort order.

**Architecture:** Add `sort_order` column to `polls` table via migration; polls are always returned sorted by `sort_order ASC`. A new `PATCH /meetings/:id/polls/reorder` endpoint bulk-updates sort order. Frontend adds an `UpcomingPolls` collapsible card to Attend.jsx (pre-reg + check-in + in-session-idle screens), and drag handles to `PollCard` in Facilitate.jsx.

**Tech Stack:** TypeScript/TypeORM (API), React (frontend), native HTML5 drag-and-drop (no new libraries)

---

## File Map

| File | Change |
|------|--------|
| `api/src/database/migrations/1775900000000-AddPollSortOrder.ts` | New — adds `sort_order` column, prefills existing rows |
| `api/src/database/entities/Poll.ts` | Add `sort_order` column |
| `api/src/services/PollService.ts` | Sort by `sort_order`, set on create, add `reorder()` method |
| `api/src/controllers/PollController.ts` | Add `reorder` handler |
| `api/src/index.ts` | Register `PATCH /meetings/:id/polls/reorder` route |
| `app/src/api/client.js` | Add `reorderPolls()` call |
| `app/src/context/MeetingContext.jsx` | Add `reorderPolls` action |
| `app/src/views/Attend.jsx` | Add `UpcomingPolls` component, pass `amAspirant` to WaitingScreen |
| `app/src/views/Facilitate.jsx` | Add drag handles and drag-and-drop logic to poll list |
| `app/src/locales/nl.json` | Add `attend.upcoming_polls`, `attend.upcoming_polls_empty` |
| `app/src/locales/en.json` | Same keys in English |

---

## Task 1: Migration — add sort_order column

**Files:**
- Create: `api/src/database/migrations/1775900000000-AddPollSortOrder.ts`

- [ ] Create the migration file:

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPollSortOrder1775900000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0`);
        // Give existing polls stable order based on creation time
        await queryRunner.query(`
            UPDATE "polls" p
            SET "sort_order" = sub.rn - 1
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY created_at ASC) AS rn
                FROM "polls"
            ) sub
            WHERE p.id = sub.id
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN IF EXISTS "sort_order"`);
    }

}
```

- [ ] Verify file saved correctly, no syntax errors.

---

## Task 2: Entity — add sort_order field

**Files:**
- Modify: `api/src/database/entities/Poll.ts`

- [ ] Add the column after `closed_at`:

```typescript
    @Column({ type: "int", default: 0 })
    sort_order!: number;
```

Full file after change — the new column goes between `closed_at` and `facilitator_ename`:

```typescript
    @Column({ type: "timestamptz", nullable: true })
    closed_at!: Date | null;

    @Column({ type: "int", default: 0 })
    sort_order!: number;

    @Column({ nullable: true })
    facilitator_ename!: string;
```

- [ ] Confirm file saves without TypeScript errors.

---

## Task 3: PollService — sort by sort_order, set on create, add reorder

**Files:**
- Modify: `api/src/services/PollService.ts`

- [ ] Update `create()` to assign `sort_order = max + 1` for the meeting:

Replace the `create` method body:
```typescript
    async create(meetingId: string, data: {
        motion_text: string;
        vote_options: VoteOption[];
        facilitator_ename?: string;
    }): Promise<Poll> {
        // Assign sort_order = count of existing polls (appends to end)
        const existingCount = await this.pollRepo.count({ where: { meeting_id: meetingId } });
        const poll = this.pollRepo.create({
            meeting_id: meetingId,
            motion_text: data.motion_text,
            vote_options: data.vote_options,
            facilitator_ename: data.facilitator_ename,
            status: "prepared",
            sort_order: existingCount,
        });
        const saved = await this.pollRepo.save(poll);

        sseService.emit(meetingId, "poll_added", { meetingId, pollId: saved.id });

        return saved;
    }
```

- [ ] Update `listForMeeting()` to sort by `sort_order`:

```typescript
    async listForMeeting(meetingId: string): Promise<Poll[]> {
        return this.pollRepo.find({
            where: { meeting_id: meetingId },
            relations: ["votes"],
            order: { sort_order: "ASC", created_at: "ASC" },
        });
    }
```

- [ ] Add `reorder()` method at the end of the class (before the closing `}`):

```typescript
    async reorder(meetingId: string, ids: string[]): Promise<void> {
        // Validate all ids belong to this meeting
        const polls = await this.pollRepo.find({ where: { meeting_id: meetingId } });
        const meetingPollIds = new Set(polls.map(p => p.id));
        for (const id of ids) {
            if (!meetingPollIds.has(id)) throw new Error(`Poll ${id} does not belong to meeting ${meetingId}`);
        }
        await Promise.all(
            ids.map((id, index) => this.pollRepo.update(id, { sort_order: index }))
        );
        sseService.emit(meetingId, "polls_reordered", { meetingId });
    }
```

---

## Task 4: PollController — add reorder handler

**Files:**
- Modify: `api/src/controllers/PollController.ts`

- [ ] Add `reorder` method to `PollController` class (after `delete`, before `decisions`):

```typescript
    reorder = async (req: Request, res: Response) => {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
                return res.status(400).json({ error: "ids must be an array of strings" });
            }
            await svc.reorder(req.params.id, ids);
            res.status(204).send();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
```

---

## Task 5: Register route in index.ts

**Files:**
- Modify: `api/src/index.ts`

- [ ] Add after the existing `poll.delete` route (line ~103):

```typescript
app.patch("/api/meetings/:id/polls/reorder", requireAuth, requireFacilitatorOfMeeting, poll.reorder);
```

**Important:** This line must go BEFORE the route `app.patch("/api/meetings/:id/polls/:pollId", ...)` — Express matches routes top-to-bottom, and `/reorder` would otherwise be treated as a `pollId`.

The correct order in the file should be:
```typescript
app.post("/api/meetings/:id/polls", requireAuth, requireFacilitatorOfMeeting, poll.create);
app.patch("/api/meetings/:id/polls/reorder", requireAuth, requireFacilitatorOfMeeting, poll.reorder);
app.patch("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.update);
app.delete("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.delete);
app.patch("/api/meetings/:id/polls/:pollId/open", requireAuth, requireFacilitatorOfMeeting, poll.open);
app.patch("/api/meetings/:id/polls/:pollId/close", requireAuth, requireFacilitatorOfMeeting, poll.close);
```

- [ ] Confirm the reorder route is positioned before the `:pollId` wildcard routes.

---

## Task 6: API client + MeetingContext — reorderPolls action

**Files:**
- Modify: `app/src/api/client.js`
- Modify: `app/src/context/MeetingContext.jsx`

- [ ] Add to `app/src/api/client.js` in the Polls section:

```javascript
export const reorderPolls = (meetingId, ids) => req('PATCH', `/meetings/${meetingId}/polls/reorder`, { ids })
```

- [ ] Add `reorderPolls` action to `MeetingContext.jsx`. Add after `deletePollAction`:

```javascript
  const reorderPollsAction = async (ids) => {
    await api.reorderPolls(meetingId.current, ids)
    await load(meetingId.current)
  }
```

- [ ] Expose it in the context value. Find the `value` object passed to `MeetingContext.Provider` and add:

```javascript
    reorderPolls: reorderPollsAction,
```

- [ ] Find where `updatePoll` and `deletePoll` are destructured in `Facilitate.jsx` (line ~16) and add `reorderPolls` to the destructure:

```javascript
    updatePoll, deletePoll, reorderPolls,
```

---

## Task 7: i18n keys

**Files:**
- Modify: `app/src/locales/nl.json`
- Modify: `app/src/locales/en.json`

- [ ] Add to `nl.json` inside the `"attend"` object (after `"agenda_tba"`):

```json
"upcoming_polls": "Stemmingen",
"upcoming_polls_empty": "Nog geen stemmingen gepland.",
```

- [ ] Add to `en.json` inside the `"attend"` object (after `"agenda_tba"`):

```json
"upcoming_polls": "Votes",
"upcoming_polls_empty": "No votes planned yet.",
```

---

## Task 8: UpcomingPolls component in Attend.jsx + WaitingScreen polls

**Files:**
- Modify: `app/src/views/Attend.jsx`

This task adds the `UpcomingPolls` collapsible card and wires it into the three screens that need it.

- [ ] Add the `UpcomingPolls` component at the bottom of `Attend.jsx` (before the closing of the file, after `ClosedMeetingScreen`):

```jsx
function UpcomingPolls({ polls, t }) {
  const [open, setOpen] = useState(false)
  const prepared = (polls || []).filter(p => p.status === 'prepared')
  if (prepared.length === 0) return null

  return (
    <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', padding: '16px 20px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.85rem',
          color: 'var(--color-charcoal)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-charcoal-light)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            🗳️ {t('attend.upcoming_polls')}
          </span>
          <span style={{ fontSize: '0.72rem', background: 'var(--color-sand)', color: 'var(--color-charcoal-light)', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
            {prepared.length}
          </span>
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-charcoal-light)' }}>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--color-sand)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {prepared.map((poll, i) => (
              <div key={poll.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2, minWidth: 16, fontWeight: 600 }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>
                  {poll.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] Update `WaitingScreen` to accept `amAspirant` and `polls` props, and render `UpcomingPolls` after the agenda card.

Find `function WaitingScreen({ meeting, dateStr, t })` and change the signature:
```jsx
function WaitingScreen({ meeting, dateStr, amAspirant, t }) {
```

Then after the closing `</div>` of the agenda card at the end of WaitingScreen's return, add:
```jsx
      {!amAspirant && <UpcomingPolls polls={meeting.polls} t={t} />}
```

- [ ] Update the call site of `WaitingScreen` in Attend.jsx. Find:
```jsx
: <WaitingScreen meeting={meeting} dateStr={dateStr} t={t} />
```
Replace with:
```jsx
: <WaitingScreen meeting={meeting} dateStr={dateStr} amAspirant={amAspirant} t={t} />
```

- [ ] Add `UpcomingPolls` to the check-in screen (the main logged-in screen). After the existing agenda card block (around line 318 in the current file), add:

```jsx
      {!amAspirant && <UpcomingPolls polls={meeting.polls} t={t} />}
```

- [ ] Add `UpcomingPolls` to the in-session screen (when no active poll). After the agenda block:
```jsx
      {/* Upcoming polls (in session, no active poll, non-aspirant) */}
      {isInSession && !activePoll && !amAspirant && (
        <UpcomingPolls polls={meeting.polls} t={t} />
      )}
```

---

## Task 9: Drag-and-drop in Facilitate.jsx

**Files:**
- Modify: `app/src/views/Facilitate.jsx`

Uses native HTML5 drag-and-drop. Only `prepared` polls are draggable; `active` and `closed` polls stay fixed.

- [ ] Add drag state near the top of the `Facilitate` component (after existing `useState` declarations):

```jsx
  const [dragOverId, setDragOverId] = useState(null)
```

- [ ] Replace the polls list render block in Facilitate.jsx. Find:

```jsx
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meeting.polls.map((poll, idx) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  idx={idx}
                  activePoll={activePoll}
                  attendeeCount={attendeeCount}
                  canStart={canStart(poll)}
                  onStart={() => startPoll(poll.id)}
                  onClose={() => closePoll(poll.id)}
                  onEdit={() => openEditPoll(poll)}
                  onDelete={() => deletePoll(poll.id)}
                  onManualVote={() => setShowManualVoteModal(true)}
                  getVoteCount={getVoteCount}
                  isActive={activePoll?.id === poll.id}
                  phase={meeting.phase}
                  confirmClosePollId={confirmClosePollId}
                  setConfirmClosePollId={setConfirmClosePollId}
                />
              ))}
```

Replace with:

```jsx
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meeting.polls.map((poll, idx) => (
                <div
                  key={poll.id}
                  draggable={poll.status === 'prepared' && meeting.phase !== 'archived'}
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', poll.id)
                  }}
                  onDragOver={e => {
                    if (poll.status !== 'prepared') return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverId(poll.id)
                  }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverId(null)
                    const draggedId = e.dataTransfer.getData('text/plain')
                    if (draggedId === poll.id) return
                    const ids = meeting.polls.map(p => p.id)
                    const fromIdx = ids.indexOf(draggedId)
                    const toIdx = ids.indexOf(poll.id)
                    if (fromIdx === -1 || toIdx === -1) return
                    const reordered = [...ids]
                    reordered.splice(fromIdx, 1)
                    reordered.splice(toIdx, 0, draggedId)
                    reorderPolls(reordered)
                  }}
                  onDragEnd={() => setDragOverId(null)}
                  style={{
                    opacity: dragOverId === poll.id ? 0.6 : 1,
                    transition: 'opacity 0.15s',
                    cursor: poll.status === 'prepared' && meeting.phase !== 'archived' ? 'grab' : 'default',
                  }}
                >
                  <PollCard
                    poll={poll}
                    idx={idx}
                    activePoll={activePoll}
                    attendeeCount={attendeeCount}
                    canStart={canStart(poll)}
                    onStart={() => startPoll(poll.id)}
                    onClose={() => closePoll(poll.id)}
                    onEdit={() => openEditPoll(poll)}
                    onDelete={() => deletePoll(poll.id)}
                    onManualVote={() => setShowManualVoteModal(true)}
                    getVoteCount={getVoteCount}
                    isActive={activePoll?.id === poll.id}
                    phase={meeting.phase}
                    confirmClosePollId={confirmClosePollId}
                    setConfirmClosePollId={setConfirmClosePollId}
                    isDraggable={poll.status === 'prepared' && meeting.phase !== 'archived'}
                  />
                </div>
              ))}
```

- [ ] Add a visual drag handle inside `PollCard`. Find the `PollCard` function definition and add `isDraggable` to its props. Then at the very start of its returned JSX (the outermost wrapper div's children), add:

```jsx
      {isDraggable && (
        <div style={{
          position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--color-charcoal-light)', fontSize: '1rem', lineHeight: 1,
          cursor: 'grab', userSelect: 'none', opacity: 0.4,
        }}>
          ⠿
        </div>
      )}
```

For this to be positioned correctly, the `PollCard` outermost div needs `position: 'relative'`. Verify it has that, or add it.

Also add `paddingLeft` to the PollCard container when `isDraggable` is true so content doesn't overlap the handle:
- If the outer div of PollCard has a fixed padding (e.g. `padding: 16`), change it to `paddingLeft: isDraggable ? 28 : 16` (or similar).

---

## Task 10: Commit

- [ ] Verify the app starts without errors:
```bash
cd /home/serzhilin/Projects/ALVer
# API
cd api && npx tsc --noEmit
# Frontend
cd ../app && npx vite build --mode development 2>&1 | head -30
```

- [ ] Commit everything:
```bash
cd /home/serzhilin/Projects/ALVer
git add \
  api/src/database/migrations/1775900000000-AddPollSortOrder.ts \
  api/src/database/entities/Poll.ts \
  api/src/services/PollService.ts \
  api/src/controllers/PollController.ts \
  api/src/index.ts \
  app/src/api/client.js \
  app/src/context/MeetingContext.jsx \
  app/src/views/Attend.jsx \
  app/src/views/Facilitate.jsx \
  app/src/locales/nl.json \
  app/src/locales/en.json
git commit -m "feat: poll reorder (drag-and-drop) + upcoming polls visible to attendees

- sort_order column on polls, persisted, set on create
- PATCH /meetings/:id/polls/reorder bulk-updates sort order
- drag-and-drop on prepared polls in facilitator view
- UpcomingPolls collapsible card in attendee view (pre-reg, check-in, in-session)
- hidden from aspirant members

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
