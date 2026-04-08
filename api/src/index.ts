import "reflect-metadata";
import path from "path";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { AppDataSource } from "./database/data-source";
import { MeetingController } from "./controllers/MeetingController";
import { AttendeeController } from "./controllers/AttendeeController";
import { MandateController } from "./controllers/MandateController";
import { PollController } from "./controllers/PollController";
import { VoteController } from "./controllers/VoteController";
import { WebhookController } from "./controllers/WebhookController";
import { CommunityController } from "./controllers/CommunityController";
import { getOffer, epassportLogin, sseAuthStream, getSessionResult, getMe, getMyCommunities, devLogin } from "./controllers/AuthController";
import { listCommunities, createCommunity, deleteCommunity } from "./controllers/AdminController";
import { requireAuth, optionalAuth } from "./middleware/auth";
import { requireFacilitatorOfMeeting } from "./middleware/requireFacilitatorOfMeeting";
import { requireAdmin } from "./middleware/adminAuth";

config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: '10mb' }));

// ── Controllers ──────────────────────────────────────────────────────────────
const meeting = new MeetingController();
const community = new CommunityController();
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
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.get("/api/auth/offer", authLimiter, getOffer);
app.post("/api/auth/login", authLimiter, epassportLogin);
app.post("/api/auth/dev-login", devLogin);
app.get("/api/auth/sessions/:id", sseAuthStream);
app.get("/api/auth/sessions/:id/result", getSessionResult);
app.get("/api/auth/me", requireAuth, getMe);
app.get("/api/auth/communities", requireAuth, getMyCommunities);

// ── Community ─────────────────────────────────────────────────────────────────
app.get("/api/community/branding", community.getBranding);          // public
app.get("/api/community", requireAuth, community.get);
app.patch("/api/community", requireAuth, community.update);
app.get("/api/community/members", requireAuth, community.listMembers);
app.post("/api/community/members", requireAuth, community.createMember);
app.patch("/api/community/members/:memberId", requireAuth, community.updateMember);
app.delete("/api/community/members/:memberId", requireAuth, community.deleteMember);

// ── Meetings (optional auth for community scoping) ────────────────────────────
app.get("/api/meetings", optionalAuth, meeting.getAll);
app.post("/api/meetings", requireAuth, meeting.create);
app.get("/api/meetings/:id", meeting.getById);
app.patch("/api/meetings/:id", requireAuth, requireFacilitatorOfMeeting, meeting.update);
app.delete("/api/meetings/:id", requireAuth, requireFacilitatorOfMeeting, meeting.delete);
app.get("/api/meetings/:id/stream", meeting.stream);              // SSE

// ── Facilitator actions — require eID auth ────────────────────────────────────
app.patch("/api/meetings/:id/status", requireAuth, requireFacilitatorOfMeeting, meeting.transitionStatus);
app.post("/api/meetings/:id/reopen", requireAuth, requireFacilitatorOfMeeting, meeting.reopen);
app.patch("/api/meetings/:id/display-mode",    requireAuth, requireFacilitatorOfMeeting, meeting.setDisplayMode);
app.patch("/api/meetings/:id/screen-theme",    requireAuth, requireFacilitatorOfMeeting, meeting.setScreenTheme);
app.patch("/api/meetings/:id/screen-language", requireAuth, requireFacilitatorOfMeeting, meeting.setScreenLanguage);
app.post("/api/meetings/:id/attendees/manual", requireAuth, requireFacilitatorOfMeeting, attendee.manualAdd);
app.post("/api/meetings/:id/mandates", requireAuth, requireFacilitatorOfMeeting, mandate.create);
app.patch("/api/meetings/:id/mandates/:mandateId/revoke", requireAuth, requireFacilitatorOfMeeting, mandate.revoke);
app.post("/api/meetings/:id/polls", requireAuth, requireFacilitatorOfMeeting, poll.create);
app.patch("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.update);
app.delete("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.delete);
app.patch("/api/meetings/:id/polls/:pollId/open", requireAuth, requireFacilitatorOfMeeting, poll.open);
app.patch("/api/meetings/:id/polls/:pollId/close", requireAuth, requireFacilitatorOfMeeting, poll.close);

// ── Meeting members (public — mandate dropdown) ───────────────────────────────
app.get("/api/meetings/:id/members", meeting.getMembers);

// ── Attendees (public — self check-in) ───────────────────────────────────────
app.get("/api/meetings/:id/attendees", attendee.list);
app.post("/api/meetings/:id/attendees", attendee.preRegister);
app.post("/api/meetings/:id/attendees/checkin", attendee.checkIn);
app.patch("/api/meetings/:id/attendees/:attendeeId", attendee.update);
app.delete("/api/meetings/:id/attendees/:attendeeId", requireAuth, requireFacilitatorOfMeeting, attendee.delete);

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

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get("/api/admin/communities", requireAuth, requireAdmin, listCommunities);
app.post("/api/admin/communities", requireAuth, requireAdmin, createCommunity);
app.delete("/api/admin/communities/:id", requireAuth, requireAdmin, deleteCommunity);

// ── W3DS Webhook ─────────────────────────────────────────────────────────────
app.post("/api/webhook", webhook.handleWebhook);

// ── Serve React frontend (production only) ────────────────────────────────────
// In the Docker image, app/dist is copied to <api-root>/client/
if (process.env.NODE_ENV === "production") {
    const clientPath = path.join(__dirname, "../client");
    app.use(express.static(clientPath));
    app.use((_req, res) => res.sendFile(path.join(clientPath, "index.html")));
} else {
    // Dev: ngrok tunnels to this API port, so the wallet opens /deeplink-login here.
    // Relay the browser to the Vite dev server (same path + query string).
    const devFrontend = process.env.CLIENT_URL || "http://localhost:5174";
    app.get("/deeplink-login", (req, res) => {
        const target = new URL("/deeplink-login", devFrontend);
        for (const [k, v] of Object.entries(req.query)) {
            if (typeof v === "string") target.searchParams.set(k, v);
        }
        res.redirect(302, target.toString());
    });
}

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
