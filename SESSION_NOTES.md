# Session notes — ALVer local backend

## What was completed

- Full TypeScript Express API at `api/` following eCurrency/eVoting patterns exactly
- PostgreSQL via Docker (DB only — local dev servers run natively)
- TypeORM entities: Meeting, Attendee, Mandate, Poll, Vote, Decision
- All service/repository/controller layers with W3DS stub hooks in place
- SSE stream at `GET /api/meetings/:id/stream` — emits: `attendee_checked_in`, `poll_opened`, `vote_cast`, `poll_closed`, `meeting_status_changed`
- React frontend wired to API via `/api` proxy (Vite) — no CORS issues in dev
- MeetingContext replaced: localStorage → API calls + SSE subscription
- Seed script reproduces exact prototype dummy data
- W3DS webhook stub at `POST /api/webhook`

## Decisions made

- **`synchronize: true`** in dev TypeORM config (no migrations yet). Swap for `synchronize: false` + migrations before production.
- **PostgreSQL port 5433** (not 5432) to avoid conflicts with any local Postgres.
- **Name-based identity** kept for now — no eID wallet auth. Facilitator is whoever opens /facilitate.
- **SSE refresh pattern**: on any SSE event the frontend re-fetches the full meeting from the API. Simple and correct for the prototype scale.
- **Option IDs**: poll options stored as `{id, label}` pairs. ID is the lowercased slug of the label (e.g. `voor`, `ja`). Winner detection checks `id.toLowerCase() === "voor" || "ja"`.

## Known issues / deferred decisions

- No auth on facilitator routes — any tab can open /facilitate and control the meeting.
- `synchronize: true` is not safe for production — add TypeORM migrations before going live.
- The Archive view reads decisions from the poll votes directly (via adaptPoll) — it should eventually read from the `decisions` table for the full signed record.
- QR code on the Display screen is a static SVG placeholder — needs a real QR library pointing to `/meeting/:id/attend`.

## Next session: W3DS integration

Starting point in `api/src/web3adapter/subscriber.ts` — the stub is ready.
Pattern to follow: eCurrency's `PostgresSubscriber` with 3-second debounce and `lockedIds` loop prevention.
Mapping files will go in `api/src/web3adapter/mappings/`.
Webhook receiver is stubbed at `POST /api/webhook` in `WebhookController.ts`.
