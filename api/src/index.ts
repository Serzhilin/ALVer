import "reflect-metadata";
import path from "path";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { AppDataSource } from "./database/data-source";
import { MeetingController } from "./controllers/MeetingController";
import { AttendeeController } from "./controllers/AttendeeController";
import { MandateController } from "./controllers/MandateController";
import { PollController } from "./controllers/PollController";
import { VoteController } from "./controllers/VoteController";
import { WebhookController } from "./controllers/WebhookController";
import { getOffer, epassportLogin, sseAuthStream, getMe } from "./controllers/AuthController";
import { requireAuth } from "./middleware/auth";

config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json());

// ── Controllers ──────────────────────────────────────────────────────────────
const meeting = new MeetingController();
const attendee = new AttendeeController();
const mandate = new MandateController();
const poll = new PollController();
const vote = new VoteController();
const webhook = new WebhookController();

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({
    status: "ok",
    db: AppDataSource.isInitialized ? "connected" : "disconnected",
}));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get("/api/auth/offer", getOffer);
app.post("/api/auth/login", epassportLogin);
app.get("/api/auth/sessions/:id", sseAuthStream);
app.get("/api/auth/me", requireAuth, getMe);

// ── Meetings (public reads) ───────────────────────────────────────────────────
app.get("/api/meetings", meeting.getAll);
app.post("/api/meetings", meeting.create);
app.get("/api/meetings/:id", meeting.getById);
app.patch("/api/meetings/:id", meeting.update);
app.get("/api/meetings/:id/stream", meeting.stream);              // SSE

// ── Facilitator actions — require eID auth ────────────────────────────────────
app.patch("/api/meetings/:id/status", requireAuth, meeting.transitionStatus);
app.post("/api/meetings/:id/attendees/manual", requireAuth, attendee.manualAdd);
app.post("/api/meetings/:id/mandates", requireAuth, mandate.create);
app.patch("/api/meetings/:id/mandates/:mandateId/revoke", requireAuth, mandate.revoke);
app.post("/api/meetings/:id/polls", requireAuth, poll.create);
app.patch("/api/meetings/:id/polls/:pollId", requireAuth, poll.update);
app.delete("/api/meetings/:id/polls/:pollId", requireAuth, poll.delete);
app.patch("/api/meetings/:id/polls/:pollId/open", requireAuth, poll.open);
app.patch("/api/meetings/:id/polls/:pollId/close", requireAuth, poll.close);

// ── Attendees (public — self check-in) ───────────────────────────────────────
app.get("/api/meetings/:id/attendees", attendee.list);
app.post("/api/meetings/:id/attendees", attendee.preRegister);
app.post("/api/meetings/:id/attendees/checkin", attendee.checkIn);
app.patch("/api/meetings/:id/attendees/:attendeeId", attendee.update);

// ── Mandates (public reads) ───────────────────────────────────────────────────
app.get("/api/meetings/:id/mandates", mandate.list);

// ── Polls (public reads) ──────────────────────────────────────────────────────
app.get("/api/meetings/:id/polls", poll.list);
app.get("/api/meetings/:id/decisions", poll.decisions);

// ── Votes (public — self service) ────────────────────────────────────────────
app.post("/api/polls/:pollId/votes", vote.cast);
app.post("/api/polls/:pollId/votes/manual", requireAuth, vote.manualVote);
app.get("/api/polls/:pollId/votes/count", vote.count);
app.get("/api/polls/:pollId/votes/has-voted", vote.hasVoted);
app.get("/api/polls/:pollId/results", vote.results);

// ── W3DS Webhook ─────────────────────────────────────────────────────────────
app.post("/api/webhook", webhook.handleWebhook);

// ── DB init → listen ──────────────────────────────────────────────────────────
AppDataSource.initialize()
    .then(() => {
        console.log("✅ Database connected");
        app.listen(port, () => console.log(`🚀 ALVer API running on http://localhost:${port}`));
    })
    .catch((err) => {
        console.error("❌ Database connection failed:", err);
        process.exit(1);
    });
