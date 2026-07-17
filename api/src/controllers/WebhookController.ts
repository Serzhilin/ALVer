import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { adapter } from "../web3adapter/subscriber";
import { syncMemberFromEvaultProfile } from "../services/MemberSyncService";
import {
    syncCommunityFromEvault,
    syncMeetingFromEvault,
    syncPollFromEvault,
    syncVoteFromEvault,
} from "../services/InboundSyncService";
import { ONTOLOGIES } from "../lib/w3ds/ontology";
import { logger } from "../lib/logger";

const AAAS_WEBHOOK_SECRET = process.env.AAAS_WEBHOOK_SECRET ?? "";

interface WebhookPayload {
    id?: string;
    w3id?: string;
    eName?: string;           // legacy field
    schemaId?: string;
    ontology?: string;        // AaaS uses this name
    operation?: "create" | "update" | "delete";
    data?: Record<string, unknown> | null;
    receivedAt?: string;
    metaEnvelopeId?: string;  // legacy field
}

function verifySignature(rawBody: string, sigHeader: string | null): boolean {
    if (!AAAS_WEBHOOK_SECRET) return true; // dev: no secret = skip verify
    if (!sigHeader) return false;
    const provided = sigHeader.replace(/^sha256=/, "").trim();
    if (!provided) return false;
    const computed = createHmac("sha256", AAAS_WEBHOOK_SECRET)
        .update(rawBody, "utf8")
        .digest("hex");
    if (provided.length !== computed.length) return false;
    try {
        return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(computed, "hex"));
    } catch {
        return false;
    }
}

export class WebhookController {
    handleWebhook = async (req: Request, res: Response): Promise<void> => {
        const rawBody = JSON.stringify(req.body);

        if (!verifySignature(rawBody, req.headers["x-aaas-signature"] as string ?? null)) {
            res.status(401).json({ error: "bad_signature" });
            return;
        }

        const raw = req.body as WebhookPayload;
        const metaEnvelopeId = raw.id ?? raw.metaEnvelopeId;
        const vaultEname = raw.w3id ?? raw.eName;
        const ontology = raw.ontology ?? raw.schemaId;
        const data = raw.data ?? null;

        // Respond immediately per W3DS Awareness Protocol — process async, do not block
        res.status(200).json({ received: true });

        // Lock this ID so the TypeORM subscriber skips outgoing re-sync
        if (metaEnvelopeId) adapter.addToLockedIds(metaEnvelopeId);
        if (vaultEname)     adapter.addToLockedIds(vaultEname);

        // Dispatch by ontology
        try {
            if (!ontology || !data) return;
            if (ontology === ONTOLOGIES.User && vaultEname) {
                await this.handleUserProfileUpdate(vaultEname, data);
            } else if (ontology === ONTOLOGIES.Community && vaultEname) {
                await syncCommunityFromEvault(vaultEname, data);
            } else if (ontology === ONTOLOGIES.Meeting && metaEnvelopeId) {
                await syncMeetingFromEvault(metaEnvelopeId, data);
            } else if (ontology === ONTOLOGIES.Poll && metaEnvelopeId) {
                await syncPollFromEvault(metaEnvelopeId, data);
            } else if (ontology === ONTOLOGIES.Vote && metaEnvelopeId) {
                await syncVoteFromEvault(metaEnvelopeId, data);
            }
        } catch (err) {
            logger.error({ err, ontology, metaEnvelopeId }, "[W3DS webhook] dispatch error");
        }
    };

    private async handleUserProfileUpdate(vaultEname: string, data: Record<string, unknown>): Promise<void> {
        await syncMemberFromEvaultProfile(vaultEname, data);
    }
}
