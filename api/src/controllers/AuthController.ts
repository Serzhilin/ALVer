import { Request, Response } from "express";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { verifySignature } from "signature-validator";
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
    const baseUrl = process.env.PUBLIC_ALVER_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const sessionId = uuidv4();
    const redirectUrl = new URL("/api/auth/login", baseUrl).toString();
    const offer = `w3ds://auth?redirect=${encodeURIComponent(redirectUrl)}&session=${sessionId}&platform=ALVer`;
    res.json({ offer, sessionId });
}

/** POST /api/auth/login
 *  Called by the eID wallet after the user approves.
 *  Verifies signature → findOrCreate user → issue JWT → unblock desktop SSE.
 */
export async function epassportLogin(req: Request, res: Response) {
    const { ename, session, signature } = req.body;
    if (!ename || !session || !signature) {
        res.status(400).json({ error: "Missing ename, session, or signature" });
        return;
    }

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    if (!registryUrl) {
        res.status(500).json({ error: "PUBLIC_REGISTRY_URL not configured" });
        return;
    }

    try {
        const result = await verifySignature({
            eName: ename,
            signature,
            payload: session,
            registryBaseUrl: registryUrl,
        });

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
    const payload = { token, user: serializeUser(user) };

    // Unblock desktop browser waiting on SSE
    sessions.emit(session, payload);

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

/** GET /api/auth/me
 *  Returns current user from JWT. Used by frontend on app load.
 */
export async function getMe(req: Request, res: Response) {
    // req.user is set by requireAuth middleware
    const { userId } = req.user!;
    const { findById } = await import("../services/UserService");
    const user = await findById(userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(serializeUser(user));
}
