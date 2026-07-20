import { AppDataSource } from "../database/data-source";
import { Poll, VoteOption } from "../database/entities/Poll";
import { Vote } from "../database/entities/Vote";
import { Decision } from "../database/entities/Decision";
import { Meeting } from "../database/entities/Meeting";
import { sseService } from "./SSEService";
import { getUserMetaEnvelopeId } from "../lib/evault";

export class PollService {
    private pollRepo = AppDataSource.getRepository(Poll);
    private voteRepo = AppDataSource.getRepository(Vote);
    private decisionRepo = AppDataSource.getRepository(Decision);

    async create(meetingId: string, data: {
        motion_text: string;
        vote_options: VoteOption[];
        facilitator_ename?: string;
    }, creatorEname?: string): Promise<Poll> {
        const existingCount = await this.pollRepo.count({ where: { meeting_id: meetingId } });
        const poll = this.pollRepo.create({
            meeting_id: meetingId,
            motion_text: data.motion_text,
            vote_options: data.vote_options,
            facilitator_ename: data.facilitator_ename,
            status: "prepared",
            sort_order: existingCount,
        });

        // Populate option_labels synchronously from vote_options
        if (poll.vote_options && Array.isArray(poll.vote_options)) {
            poll.option_labels = poll.vote_options.map((o: { id: string; label: string }) => o.label);
        }

        const saved = await this.pollRepo.save(poll);

        // Resolve and store creator's MetaEnvelope ID fire-and-forget
        if (creatorEname) {
            getUserMetaEnvelopeId(creatorEname)
                .then(metaId => {
                    if (metaId) this.pollRepo.update(saved.id, { created_by_meta_envelope_id: metaId });
                })
                .catch(() => {/* non-critical */});
        }

        sseService.emit(meetingId, "poll_added", { meetingId, pollId: saved.id });

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('poll', saved.id, saved);

        return saved;
    }

    async listForMeeting(meetingId: string): Promise<Poll[]> {
        return this.pollRepo.find({
            where: { meeting_id: meetingId },
            relations: ["votes"],
            order: { sort_order: "ASC", created_at: "ASC" },
        });
    }

    async findById(pollId: string): Promise<Poll | null> {
        return this.pollRepo.findOne({
            where: { id: pollId },
            relations: ["votes"],
        });
    }

    async open(pollId: string, meetingId: string): Promise<Poll> {
        // BUG-3: meeting must be in_session before opening a poll
        const meetingRepo = AppDataSource.getRepository(Meeting);
        const meeting = await meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status !== "in_session") {
            throw new Error("Meeting must be in session to open a poll");
        }

        // Ensure no other poll is active for this meeting
        const active = await this.pollRepo.findOne({
            where: { meeting_id: meetingId, status: "active" },
        });
        if (active && active.id !== pollId) {
            throw new Error("Another poll is already active for this meeting");
        }

        let poll = await this.pollRepo.findOneByOrFail({ id: pollId });
        poll.status = "active";
        poll.opened_at = new Date();
        poll = await this.pollRepo.save(poll);

        sseService.emit(meetingId, "poll_opened", {
            meetingId,
            poll: { id: poll.id, motion_text: poll.motion_text, vote_options: poll.vote_options },
        });

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('poll', pollId, poll);

        return poll;
    }

    async close(pollId: string, meetingId: string): Promise<{ poll: Poll; decision: Decision }> {
        const now = new Date();
        let poll = await this.pollRepo.findOneOrFail({
            where: { id: pollId },
            relations: ["votes"],
        });
        poll.status = "closed";
        poll.closed_at = now;
        poll = await this.pollRepo.save(poll);

        // Tally votes
        const tally: Record<string, number> = {};
        for (const opt of poll.vote_options) tally[opt.id] = 0;
        for (const vote of poll.votes) {
            if (tally[vote.option_id] !== undefined) tally[vote.option_id]++;
        }

        const breakdown = poll.vote_options.map((opt) => ({
            option_id: opt.id,
            label: opt.label,
            count: tally[opt.id] ?? 0,
        }));

        // Determine result: "voor" or "ja" winning = aangenomen; tie = verworpen
        const maxCount = Math.max(...Object.values(tally));
        const winners = poll.vote_options.filter((o) => (tally[o.id] ?? 0) === maxCount);
        const aangenomen =
            winners.length === 1 &&
            (winners[0].id.toLowerCase() === "voor" ||
             winners[0].id.toLowerCase() === "ja" ||
             winners[0].id.toLowerCase() === "yes");

        const decision = this.decisionRepo.create({
            poll_id: pollId,
            meeting_id: meetingId,
            motion_text: poll.motion_text,
            result: aangenomen ? "aangenomen" : "verworpen",
            breakdown,
            total_votes: poll.votes.length,
            closed_at: now,
        });
        const savedDecision = await this.decisionRepo.save(decision);

        sseService.emit(meetingId, "poll_closed", {
            meetingId,
            pollId,
            result: savedDecision.result,
            breakdown,
            total_votes: savedDecision.total_votes,
        });

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('decision', savedDecision.id, savedDecision);

        return { poll, decision: savedDecision };
    }

    async update(pollId: string, data: Partial<Poll>): Promise<Poll> {
        const poll = await this.pollRepo.findOneByOrFail({ id: pollId });
        Object.assign(poll, data);
        return this.pollRepo.save(poll);
    }

    async delete(pollId: string): Promise<void> {
        const poll = await this.pollRepo.findOneBy({ id: pollId });
        if (!poll) return;
        await this.pollRepo.remove(poll);
    }

    async getDecisionsForMeeting(meetingId: string): Promise<Decision[]> {
        return this.decisionRepo.find({
            where: { meeting_id: meetingId },
            order: { closed_at: "ASC" },
        });
    }

    async reorder(meetingId: string, ids: string[]): Promise<void> {
        // Validate all ids belong to this meeting
        const polls = await this.pollRepo.find({ where: { meeting_id: meetingId } });
        const meetingPollIds = new Set(polls.map(p => p.id));
        for (const id of ids) {
            if (!meetingPollIds.has(id)) throw new Error(`Poll ${id} does not belong to meeting ${meetingId}`);
        }
        await Promise.all(
            ids.map(async (id, index) => {
                const poll = polls.find((p) => p.id === id)!;
                poll.sort_order = index;
                await this.pollRepo.save(poll);
            })
        );
        sseService.emit(meetingId, "polls_reordered", { meetingId });
    }
}
