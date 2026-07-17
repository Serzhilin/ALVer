import "reflect-metadata";
import path from "path";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { AppDataSource } from "./database/data-source";
import { MeetingController } from "./controllers/MeetingController";
import { AttendanceService } from "./services/AttendanceService";
import { AttendeeController } from "./controllers/AttendeeController";
import { MandateController } from "./controllers/MandateController";
import { PollController } from "./controllers/PollController";
import { VoteController } from "./controllers/VoteController";
import { WebhookController } from "./controllers/WebhookController";
import { CommunityController } from "./controllers/CommunityController";
import { getOffer, epassportLogin, sseAuthStream, getSessionResult, getMe, getMyCommunities, devLogin } from "./controllers/AuthController";
import { listCommunities, deleteCommunity } from "./controllers/AdminController";
import { resolveW3id, linkCommunity } from "./services/CommunityService";
import { requireAuth, optionalAuth } from "./middleware/auth";
import { requireFacilitatorOfMeeting } from "./middleware/requireFacilitatorOfMeeting";
import { requireAdmin } from "./middleware/adminAuth";
import { MinutesController } from "./controllers/MinutesController";
import { requireNotulisOrFacilitator } from "./middleware/requireNotulisOrFacilitator";
import { startPolling } from "./services/AaaSService";

config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: '10mb' }));

// ── Request logging ───────────────────────────────────────────────────────────
app.use(pinoHttp({
    logger,
    // Attach authenticated user's ename to every log line
    customProps: (req: any) => ({ ename: req.user?.ename ?? undefined }),
    // SSE streams are long-lived — skip auto-logging, SSEService logs connect/disconnect
    autoLogging: { ignore: (req) => !!req.url?.includes("/stream") },
    customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
}));

// ── Controllers ──────────────────────────────────────────────────────────────
const meeting = new MeetingController();
const community = new CommunityController();
const attendee = new AttendeeController();
const mandate = new MandateController();
const poll = new PollController();
const vote = new VoteController();
const webhook = new WebhookController();
const minutes = new MinutesController();

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

// ── Community linking (W3DS) ──────────────────────────────────────────────────
const W3ID_ERROR_STATUS: Record<string, number> = {
    w3id_not_found: 404,
    group_not_found: 404,
    not_admin: 403,
    w3id_already_linked: 409,
    slug_taken: 409,
    actor_has_no_ename: 400,
};

app.get("/api/communities/resolve", requireAuth, async (req, res) => {
    const w3id = req.query.w3id as string;
    if (!w3id) { res.status(400).json({ error: "w3id required" }); return; }
    const ename = req.user?.ename;
    if (!ename) { res.status(400).json({ error: "actor_has_no_ename" }); return; }
    try {
        const result = await resolveW3id(w3id, ename);
        res.json(result);
    } catch (err: any) {
        const status = W3ID_ERROR_STATUS[err.message] ?? 500;
        res.status(status).json({ error: err.message });
    }
});

app.post("/api/communities/link", requireAuth, async (req, res) => {
    const { w3id, slug } = req.body ?? {};
    if (!w3id || !slug) { res.status(400).json({ error: "w3id and slug required" }); return; }
    const ename = req.user?.ename;
    if (!ename) { res.status(400).json({ error: "actor_has_no_ename" }); return; }
    try {
        const community = await linkCommunity({ w3id, slug }, ename);
        res.status(201).json(community);
    } catch (err: any) {
        const status = W3ID_ERROR_STATUS[err.message] ?? 500;
        res.status(status).json({ error: err.message });
    }
});

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
app.post("/api/meetings/:id/attendees/preregister", requireAuth, attendee.preRegister);
app.post("/api/meetings/:id/attendees/decline", requireAuth, attendee.decline);
app.post("/api/meetings/:id/attendees/manual", requireAuth, requireFacilitatorOfMeeting, attendee.manualAdd);
app.post("/api/meetings/:id/mandates", requireAuth, requireFacilitatorOfMeeting, mandate.create);
app.patch("/api/meetings/:id/mandates/:mandateId/revoke", requireAuth, requireFacilitatorOfMeeting, mandate.revoke);
app.post("/api/meetings/:id/polls", requireAuth, requireFacilitatorOfMeeting, poll.create);
app.patch("/api/meetings/:id/polls/reorder", requireAuth, requireFacilitatorOfMeeting, poll.reorder);
app.patch("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.update);
app.delete("/api/meetings/:id/polls/:pollId", requireAuth, requireFacilitatorOfMeeting, poll.delete);
app.patch("/api/meetings/:id/polls/:pollId/open", requireAuth, requireFacilitatorOfMeeting, poll.open);
app.patch("/api/meetings/:id/polls/:pollId/close", requireAuth, requireFacilitatorOfMeeting, poll.close);

// ── Minutes ───────────────────────────────────────────────────────────────────
app.patch("/api/meetings/:id/notulist",         requireAuth, minutes.assignNotulist);
app.patch("/api/meetings/:id/minutes",          requireAuth, requireNotulisOrFacilitator, minutes.saveDraft);
app.patch("/api/meetings/:id/minutes/publish",  requireAuth, requireNotulisOrFacilitator, minutes.publish);

// ── Meeting members (public — mandate dropdown) ───────────────────────────────
app.get("/api/meetings/:id/members", meeting.getMembers);

// ── Attendance records (created on archive, used for statistics) ──────────────
app.get("/api/meetings/:id/attendance", requireAuth, async (req, res) => {
    try {
        const records = await new AttendanceService().getForMeeting(req.params.id);
        res.json(records);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ── Attendees (self check-in requires auth — ename used for dedup) ────────────
app.get("/api/meetings/:id/attendees", attendee.list);
app.post("/api/meetings/:id/attendees/checkin", requireAuth, attendee.checkIn);
app.patch("/api/meetings/:id/attendees/:attendeeId", attendee.update);
app.delete("/api/meetings/:id/attendees/:attendeeId", requireAuth, requireFacilitatorOfMeeting, attendee.delete);

// ── Mandates (public reads) ───────────────────────────────────────────────────
app.get("/api/meetings/:id/mandates", mandate.list);

// ── Polls (public reads) ──────────────────────────────────────────────────────
app.get("/api/meetings/:id/polls", poll.list);
app.get("/api/meetings/:id/decisions", poll.decisions);

// ── Votes (auth required — voter identity verified via JWT) ──────────────────
app.post("/api/polls/:pollId/votes", requireAuth, vote.cast);
app.post("/api/polls/:pollId/votes/manual", requireAuth, vote.manualVote);
app.delete("/api/polls/:pollId/votes/:voteId", requireAuth, vote.deleteVote);
app.get("/api/polls/:pollId/votes/count", vote.count);
app.get("/api/polls/:pollId/votes/has-voted", vote.hasVoted);
app.get("/api/polls/:pollId/results", vote.results);

// ── Client-side error reporting ───────────────────────────────────────────────
app.post("/api/log/client-error", (req, res) => {
    const { message, stack, url, component, ename, userAgent } = req.body ?? {};
    logger.error({ type: "client_error", message, stack, url, component, ename, userAgent }, "client error");
    res.status(204).send();
});

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get("/api/admin/communities", requireAuth, requireAdmin, listCommunities);
app.delete("/api/admin/communities/:id", requireAuth, requireAdmin, deleteCommunity);

// ── W3DS Webhook ─────────────────────────────────────────────────────────────
app.post("/api/webhook", webhook.handleWebhook);

// ── W3DS Platform Self-Description ───────────────────────────────────────────
app.get("/.well-known/w3ds-platform.json", (_req, res) => {
    res.json({
        name: "ALVer",
        description: "Cooperative meeting and voting platform",
        platform: process.env.VITE_PUBLIC_ALVER_BASE_URL ?? "",
        ontologies: [
            {
                name: "CalendarEvent",
                schemaId: "880e8400-e29b-41d4-a716-446655440099",
                tableName: "meetings",
                fields: { title: "name", start: "startDateTime", end: "endDateTime" },
            },
            {
                name: "Poll",
                schemaId: "660e8400-e29b-41d4-a716-446655440100",
                tableName: "polls",
                fields: { title: "motion_text", options: "vote_options[].label", mode: "normal", deadline: "closed_at" },
            },
            {
                name: "Vote",
                schemaId: "660e8400-e29b-41d4-a716-446655440101",
                tableName: "votes",
                fields: { pollId: "poll_id", voterId: "voter_ename", data: "{ mode, options: [option_id] }" },
            },
            {
                name: "Community",
                schemaId: "550e8400-e29b-41d4-a716-446655440003",
                tableName: "communities",
                fields: { name: "name", eName: "ename", owner: "facilitator_ename", avatar: "logo_url" },
            },
        ],
        webhookUrl: `${process.env.VITE_PUBLIC_ALVER_BASE_URL ?? ""}/api/webhook`,
    });
});

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
    .then(async () => {
        logger.info("database connected");
        // Run any pending migrations before accepting traffic
        const ran = await AppDataSource.runMigrations();
        if (ran.length > 0) {
            logger.info({ migrations: ran.map(m => m.name) }, "migrations applied");
        }
        app.listen(port, () => {
            logger.info({ port }, "ALVer API started");
            startPolling();
        });
    })
    .catch((err) => {
        logger.fatal({ err }, "database connection failed");
        process.exit(1);
    });
