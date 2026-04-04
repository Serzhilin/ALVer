import { Request, Response } from "express";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { verifySignature } from "../lib/signature-validator";
import {
    findOrCreateByEname,
    fetchEVaultProfile,
    updateUser,
    displayName,
} from "../services/UserService";
import { signToken } from "../middleware/auth";

// In-memory SSE bus: sessionId → waiting desktop browser
const sessions = new EventEmitter();
sessions.setMaxListeners(500);

// In-memory result cache: sessionId → payload (for mobile polling after browser resumes)
const sessionResults = new Map<string, object>();
// returnTo store: sessionId → returnTo path (wallet strips query params from redirect URL)
const sessionReturnTo = new Map<string, string>();
setTimeout(() => {
    // Clean up stale results every 30 min
    setInterval(() => { sessionResults.clear(); sessionReturnTo.clear(); }, 30 * 60 * 1000);
}, 0);

function serializeUser(user: any) {
    return {
        id: user.id,
        ename: user.ename,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: displayName(user),
    };
}

/** GET /api/auth/offer
 *  Returns the w3ds:// deep link and a sessionId for the SSE poll.
 */
export async function getOffer(req: Request, res: Response) {
    const baseUrl = process.env.VITE_PUBLIC_ALVER_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const sessionId = uuidv4();
    // returnTo is a relative path the wallet browser will land on after auth (e.g. /meeting/xxx/attend)
    const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/') ? req.query.returnTo : '/';
    sessionReturnTo.set(sessionId, returnTo);
    const redirectUrl = new URL(`/api/auth/login`, baseUrl).toString();
    const offer = `w3ds://auth?redirect=${redirectUrl}&session=${sessionId}&platform=ALVer`;
    res.json({ offer, sessionId });
}

/** POST /api/auth/login
 *  Called by the eID wallet after the user approves.
 *  Verifies signature → findOrCreate user → issue JWT → unblock desktop SSE.
 */
export async function epassportLogin(req: Request, res: Response) {
    console.log("[Auth] POST /api/auth/login", { body: req.body, query: req.query });
    const { ename, session, signature } = req.body;
    if (!ename || !session || !signature) {
        console.log("[Auth] Missing fields:", { ename: !!ename, session: !!session, signature: !!signature });
        res.status(400).json({ error: "Missing ename, session, or signature" });
        return;
    }

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    if (!registryUrl) {
        res.status(500).json({ error: "PUBLIC_REGISTRY_URL not configured" });
        return;
    }

    console.log("[Auth] Verifying signature for ename:", ename);
    try {
        const result = await verifySignature({
            eName: ename,
            signature,
            payload: session,
            registryBaseUrl: registryUrl,
        });

        console.log("[Auth] Signature valid:", result.valid);
        if (!result.valid) {
            res.status(401).json({ error: "Invalid signature" });
            return;
        }
    } catch (err) {
        console.error("[Auth] verifySignature error:", err);
        res.status(401).json({ error: "Signature verification failed" });
        return;
    }

    let user = await findOrCreateByEname(ename);

    // Populate name from eVault on first login (or if missing)
    if (!user.first_name) {
        const profile = await fetchEVaultProfile(ename);
        if (profile?.first_name) {
            user = await updateUser(user.id, {
                first_name: profile.first_name,
                last_name: profile.last_name,
            });
        }
    }

    const token = signToken({ userId: user.id, ename: user.ename });
    const returnTo = sessionReturnTo.get(session) ?? '/';
    sessionReturnTo.delete(session);
    const payload = { token, user: serializeUser(user), returnTo };

    // Cache for polling fallback
    sessionResults.set(session, payload);

    // Unblock desktop browser waiting on SSE
    sessions.emit(session, payload);

    console.log("[Auth] Auth complete, returnTo:", returnTo);
    res.json(payload);
}

/** GET /api/auth/sessions/:id
 *  SSE stream — desktop browser polls here waiting for the phone to approve.
 */
export async function sseAuthStream(req: Request, res: Response) {
    const { id } = req.params;

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");

    const handler = (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.end();
    };

    sessions.once(id, handler);

    // Auto-expire after 15 minutes
    const timeout = setTimeout(() => {
        sessions.off(id, handler);
        res.write("data: {\"error\":\"timeout\"}\n\n");
        res.end();
    }, 15 * 60 * 1000);

    req.on("close", () => {
        clearTimeout(timeout);
        sessions.off(id, handler);
    });
}

/** GET /api/auth/sessions/:id/result
 *  Mobile polling endpoint — returns cached result if auth completed, else 204.
 */
export async function getSessionResult(req: Request, res: Response) {
    const { id } = req.params;
    const result = sessionResults.get(id);
    if (result) {
        sessionResults.delete(id);
        res.json(result);
    } else {
        res.status(204).end();
    }
}

/** POST /api/auth/dev-login
 *  DEV-ONLY: instantly logs in as "Tester van Vergaderen" — no eID required.
 *  Returns 404 in production.
 */
export async function devLogin(req: Request, res: Response) {
    if (process.env.NODE_ENV === "production") {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const TESTER_ENAME = "tester@dewoonwolk";
    let user = await findOrCreateByEname(TESTER_ENAME);
    if (!user.first_name) {
        user = await updateUser(user.id, { first_name: "Tester", last_name: "van Vergaderen" });
    }
    const token = signToken({ userId: user.id, ename: user.ename });
    res.json({ token, user: serializeUser(user) });
}

/** GET /api/auth/me
 *  Returns current user + community from JWT. Used by frontend on app load.
 */
export async function getMe(req: Request, res: Response) {
    const { userId, ename } = req.user!;
    const { findById } = await import("../services/UserService");
    const { CommunityService } = await import("../services/CommunityService");
    const user = await findById(userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const cs = new CommunityService();
    let community = ename ? await cs.findByFacilitatorEname(ename) : null;
    if (!community && ename) community = await cs.findByMemberEname(ename);
    const member = (community && ename) ? await cs.findMemberByEname(community.id, ename) : null;
    res.json({ ...serializeUser(user), community, member, isFacilitator: member?.is_facilitator ?? false });
}
