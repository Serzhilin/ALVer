# Meeting Minutes — Design Spec
_2026-04-08_

## Overview

Add opt-in meeting minutes to ALVer. A facilitator can assign a notulist during a meeting. The notulist writes or imports minutes (from .docx) in a TipTap editor and publishes them. Published minutes are visible to all logged-in community members in the archive. If no notulist is assigned, nothing changes for existing meetings.

---

## Data Model

Three new nullable columns on the `meetings` table:

| Column | Type | Default | Description |
|---|---|---|---|
| `minutes_html` | `TEXT` | `NULL` | Draft or published minutes content |
| `minutes_status` | `ENUM('draft','published')` | `NULL` | NULL = no minutes started |
| `notulist_ename` | `VARCHAR` | `NULL` | eID ename of the assigned notulist |

No separate table. Minutes are a property of the meeting.
The .docx file is never stored — mammoth.js parses it client-side and the resulting HTML is what gets saved.

**State machine:**
```
(none / NULL) → draft → published
```
- `NULL`: feature not used; archive looks exactly as today
- `draft`: notulist is working; only notulist + facilitator can see/edit
- `published`: visible to all logged-in community members; editing locked

Transition `published → draft` is not allowed. Publishing is a one-way action.

---

## Roles & Access

**Assigning the notulist:**
- Facilitator only, during `in_session` phase
- Uses the existing member dropdown pattern (same as mandate form)
- Can be changed or cleared at any time before publishing

**Permissions:**

| Action | Facilitator | Notulist | Other members (logged in) | Unauthenticated |
|---|---|---|---|---|
| Assign notulist | ✅ | ❌ | ❌ | ❌ |
| Edit draft minutes | ✅ | ✅ | ❌ | ❌ |
| Import .docx | ✅ | ✅ | ❌ | ❌ |
| Publish | ✅ | ✅ | ❌ | ❌ |
| Read published minutes | ✅ | ✅ | ✅ | ❌ |

Notulist identity is verified by `req.user.ename === meeting.notulist_ename`.

---

## UI Flow

### Facilitate screen (`in_session`)

A collapsible "Notulen" section at the bottom of the facilitator panel — **collapsed by default**. Inside: a single member dropdown labelled "Notulist toewijzen". Selecting a member saves immediately via `PATCH /api/meetings/:id/notulist`. Can be changed or cleared.

No minutes editing in the Facilitate screen — that's the notulist's job in the Archive.

### Archive screen — notulist/facilitator view (draft state)

When the notulist (or facilitator) opens the archived meeting:
- TipTap editor is shown, pre-populated with the existing draft HTML (or empty)
- "Importeer uit Word" button → file picker (`.docx` only) → mammoth.js parses client-side → populates editor
  - If editor already has content: confirm dialog "Dit vervangt de huidige inhoud. Doorgaan?"
- Auto-saves as draft on blur + debounced every 30 seconds (silent, no spinner)
- "Notulen publiceren" button at bottom → confirmation dialog:
  > "Na publicatie zijn de notulen zichtbaar voor alle leden en kunnen niet meer worden bewerkt. Weet je zeker dat dit de definitieve versie is?"
  - Buttons: "Ja, publiceer" / "Annuleer"

### Archive screen — all logged-in members (published state)

A "Notulen" section appears below the poll results. Renders the HTML using the existing `AgendaHtml` component. Read-only. No editor, no buttons.

### Archive screen — no minutes / no notulist assigned

Section is absent. Nothing visible. No change from current behaviour.

---

## API Endpoints

All three endpoints require authentication.

### `PATCH /api/meetings/:id/notulist`
Facilitator only.
```json
{ "notulist_ename": "@abc123" }   // or null to clear
```
Sets `meeting.notulist_ename`. Emits SSE event `notulist_assigned`.

### `PATCH /api/meetings/:id/minutes`
Notulist or facilitator only.
```json
{ "html": "<p>...</p>" }
```
Saves `minutes_html` and sets `minutes_status = 'draft'` if not already published.
Returns 403 if minutes are already published.

### `PATCH /api/meetings/:id/minutes/publish`
Notulist or facilitator only.
Sets `minutes_status = 'published'`. Returns 409 if already published.
No body required.

---

## Frontend Dependencies

- `mammoth` (browser build) — `.docx` → HTML, runs entirely client-side. No file upload to server.

---

## Database Migrations (TypeORM)

This feature is the first to use proper TypeORM migrations, replacing the current `synchronize: true` approach which is unsafe in production.

### Migration setup

1. Set `synchronize: false` in `AppDataSource` config
2. Add `migrations` path to `AppDataSource` config pointing to `src/database/migrations/*.js` (compiled output)
3. Add migration CLI script to `package.json`:
   ```json
   "migration:generate": "typeorm-ts-node-commonjs migration:generate src/database/migrations/$npm_config_name -d src/database/data-source.ts",
   "migration:run": "typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
   ```
4. Call `AppDataSource.runMigrations()` in `index.ts` **before** `app.listen()` — so every deploy automatically applies pending migrations on startup

### Migration for this feature

Generate with:
```
npm run migration:generate --name=AddMeetingMinutes
```

Expected output — adds three columns to `meetings`:
```sql
ALTER TABLE meetings ADD COLUMN minutes_html TEXT;
ALTER TABLE meetings ADD COLUMN minutes_status VARCHAR CHECK (minutes_status IN ('draft', 'published'));
ALTER TABLE meetings ADD COLUMN notulist_ename VARCHAR;
```

All nullable, all with NULL defaults — existing meetings are completely unaffected.

### Deploy flow after this change

```
git push → webhook → Coolify rebuild → container starts
→ AppDataSource.initialize()
→ AppDataSource.runMigrations()   ← runs any pending migrations once
→ app.listen()
```

TypeORM tracks which migrations have run in a `migrations` table it manages automatically. Each migration runs exactly once per database.

---

## What Stays the Same

- Archive layout for meetings without minutes: unchanged
- All existing API endpoints: unchanged
- `AgendaHtml` component: reused as-is for reading view
- Member dropdown pattern: reused from mandate form
- TipTap editor: reused from agenda editor

---

## Out of Scope (for now)

- Formal member approval of minutes at the next meeting
- Minutes versioning / history
- PDF export
- Non-member / public access to minutes
- Notulist as a permanent community role
