import { ONTOLOGIES } from "../lib/w3ds/ontology";
import { syncMemberFromEvaultProfile } from "./MemberSyncService";
import {
    syncCommunityFromEvault,
    syncMeetingFromEvault,
    syncPollFromEvault,
    syncVoteFromEvault,
} from "./InboundSyncService";
import { logger } from "../lib/logger";

const AAAS_URL = process.env.AAAS_BASE_URL || "https://aaas.w3ds.metastate.foundation";

const POLL_ONTOLOGIES = [
    ONTOLOGIES.User,
    ONTOLOGIES.Community,
    ONTOLOGIES.Meeting,
    ONTOLOGIES.Poll,
    ONTOLOGIES.Vote,
] as const;

type OntologyId = typeof POLL_ONTOLOGIES[number];

interface AaaSPacket {
    id: string;
    w3id: string;
    ontology: string;
    data: Record<string, unknown> | null;
}

interface PacketsPage {
    packets: AaaSPacket[];
    hasMore?: boolean;
    nextCursor?: string | null;
}

// Per-ontology cursor — resets on restart, re-processes last 5 min as safe fallback.
const lastCursors = new Map<string, string>(
    POLL_ONTOLOGIES.map(id => [id, new Date(Date.now() - 5 * 60 * 1000).toISOString()])
);

async function fetchPage(ontology: string, cursor?: string): Promise<PacketsPage> {
    const apiKey = process.env.AAAS_API_KEY;
    if (!apiKey) return { packets: [] };

    const from = lastCursors.get(ontology) ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const params = new URLSearchParams({ ontology, from, limit: "100" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${AAAS_URL}/api/packets?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AaaS HTTP ${res.status} for ontology ${ontology}`);
    const body = await res.json() as PacketsPage;
    return { packets: body.packets ?? [], hasMore: body.hasMore, nextCursor: body.nextCursor };
}

async function dispatchPacket(pkt: AaaSPacket): Promise<void> {
    if (!pkt.data) return;
    switch (pkt.ontology) {
        case ONTOLOGIES.User:
            await syncMemberFromEvaultProfile(pkt.w3id, pkt.data);
            break;
        case ONTOLOGIES.Community:
            await syncCommunityFromEvault(pkt.w3id, pkt.data);
            break;
        case ONTOLOGIES.Meeting:
            await syncMeetingFromEvault(pkt.id, pkt.data);
            break;
        case ONTOLOGIES.Poll:
            await syncPollFromEvault(pkt.id, pkt.data);
            break;
        case ONTOLOGIES.Vote:
            await syncVoteFromEvault(pkt.id, pkt.data);
            break;
    }
}

async function pollOntology(ontology: OntologyId): Promise<void> {
    const pollStartedAt = new Date().toISOString();
    let cursor: string | undefined;
    let total = 0;

    for (let page = 0; page < 50; page++) {
        const { packets, hasMore, nextCursor } = await fetchPage(ontology, cursor);
        total += packets.length;
        for (const pkt of packets) {
            await dispatchPacket(pkt).catch(err =>
                logger.warn({ err, packetId: pkt.id, ontology }, '[AaaS] Failed to process packet')
            );
        }
        if (!hasMore || !nextCursor) break;
        cursor = nextCursor;
    }

    if (total > 0) logger.info({ ontology, total }, '[AaaS] Packets processed');
    lastCursors.set(ontology, pollStartedAt);
}

export async function pollOnce(): Promise<void> {
    if (!process.env.AAAS_API_KEY) return;
    await Promise.allSettled(POLL_ONTOLOGIES.map(pollOntology));
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs = 60_000): void {
    if (!process.env.AAAS_API_KEY) {
        logger.info('[AaaS] AAAS_API_KEY not set — polling disabled');
        return;
    }
    if (pollInterval) return;
    logger.info({ intervalMs }, '[AaaS] Polling started');
    pollOnce();
    pollInterval = setInterval(pollOnce, intervalMs);
}

export function stopPolling(): void {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
