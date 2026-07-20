import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
import { Meeting } from "../database/entities/Meeting";
import { Poll } from "../database/entities/Poll";
import { Vote } from "../database/entities/Vote";
import { adapter } from "../web3adapter/subscriber";
import { logger } from "../lib/logger";

// Meeting stores date as "YYYY-MM-DD" and time as "HH:MM" (two separate columns).
// Parse an ISO datetime string into its date and time components (UTC).
function parseDateTimeParts(iso: string): { date: string; time: string } | null {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const date = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const time = d.toISOString().slice(11, 16); // "HH:MM"
    return { date, time };
}

export async function syncCommunityFromEvault(
    vaultEname: string,
    data: Record<string, unknown>
): Promise<void> {
    const repo = AppDataSource.getRepository(Community);
    const normalized = vaultEname.startsWith("@") ? vaultEname : `@${vaultEname}`;
    const community =
        (await repo.findOne({ where: { ename: normalized } })) ??
        (await repo.findOne({ where: { ename: vaultEname } }));
    if (!community) {
        logger.debug({ vaultEname }, "[InboundSync] Community not found locally, skipping");
        return;
    }
    const patch: Partial<Community> = {};
    if (data.name != null) patch.name = data.name as string;
    if (data.avatar != null) patch.logo_url = data.avatar as string;
    if (Object.keys(patch).length > 0) {
        await repo.update(community.id, patch);
        logger.info({ vaultEname, patch }, "[InboundSync] Community updated");
    }
}

export async function syncMeetingFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, "[InboundSync] Meeting not found in mapping table, skipping");
        return;
    }
    const repo = AppDataSource.getRepository(Meeting);
    const meeting = await repo.findOne({ where: { id: localId } });
    if (!meeting) {
        logger.debug({ globalId, localId }, "[InboundSync] Meeting row not found, skipping");
        return;
    }

    // Meeting uses date (YYYY-MM-DD) + time (HH:MM) + end_time (HH:MM) separately.
    const patch: Partial<Meeting> = {};
    if (data.title != null) patch.name = data.title as string;
    if (data.start != null) {
        const parts = parseDateTimeParts(data.start as string);
        if (parts) {
            patch.date = parts.date;
            patch.time = parts.time;
        }
    }
    if (data.end != null) {
        const parts = parseDateTimeParts(data.end as string);
        if (parts) patch.end_time = parts.time;
    }
    if (Object.keys(patch).length > 0) {
        await repo.update(localId, patch);
        logger.info({ globalId, localId }, "[InboundSync] Meeting updated");
    }
}

export async function syncPollFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, "[InboundSync] Poll not found in mapping table, skipping");
        return;
    }
    const repo = AppDataSource.getRepository(Poll);
    const poll = await repo.findOne({ where: { id: localId } });
    if (!poll) {
        logger.debug({ globalId, localId }, "[InboundSync] Poll row not found, skipping");
        return;
    }
    const patch: Partial<Poll> = {};
    if (data.title)    patch.motion_text = data.title as string;
    if (data.deadline) patch.closed_at   = new Date(data.deadline as string);
    if (Array.isArray(data.options)) patch.option_labels = data.options as string[];
    if (patch && Object.keys(patch).length === 0) return;
    await repo.update(localId, patch);
    logger.info({ globalId, localId }, "[InboundSync] Poll updated");
}

export async function syncVoteFromEvault(
    globalId: string,
    data: Record<string, unknown>
): Promise<void> {
    const localId: string | null = await adapter.mappingDb.getLocalId(globalId);
    if (!localId) {
        logger.debug({ globalId }, "[InboundSync] Vote not found in mapping table, skipping");
        return;
    }
    const repo = AppDataSource.getRepository(Vote);
    const vote = await repo.findOne({ where: { id: localId } });
    if (!vote) {
        logger.debug({ globalId, localId }, "[InboundSync] Vote row not found, skipping");
        return;
    }
    const patch: Partial<Vote> = {};
    if (data.voterId) patch.voter_ename = data.voterId as string;
    if (data.userId)  patch.voter_meta_envelope_id = data.userId as string;
    if (data.data)    patch.vote_data = data.data as Record<string, unknown>;

    // Back-derive option_id from vote_data label if poll is available
    if (data.data) {
        const votePayload = data.data as { mode?: string; data?: string[] };
        const label = votePayload.data?.[0];
        if (label) {
            const pollRepo = AppDataSource.getRepository(Poll);
            const poll = await pollRepo.findOne({ where: { id: vote.poll_id } });
            if (poll?.vote_options) {
                const match = poll.vote_options.find((o: { id: string; label: string }) => o.label === label);
                if (match) patch.option_id = match.id;
            }
        }
    }

    if (Object.keys(patch).length === 0) return;
    await repo.update(localId, patch);
    logger.info({ globalId, localId }, "[InboundSync] Vote updated");
}
