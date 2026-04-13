import { AppDataSource } from "../database/data-source";
import { Poll, VoteOption } from "../database/entities/Poll";
import { Vote } from "../database/entities/Vote";
import { Decision } from "../database/entities/Decision";
import { Meeting } from "../database/entities/Meeting";
import { sseService } from "./SSEService";

export class PollService {
    private pollRepo = AppDataSource.getRepository(Poll);
    private voteRepo = AppDataSource.getRepository(Vote);
    private decisionRepo = AppDataSource.getRepository(Decision);

    async create(meetingId: string, data: {
        motion_text: string;
        vote_options: VoteOption[];
        facilitator_ename?: string;
    }): Promise<Poll> {
        const existingCount = await this.pollRepo.count({ where: { meeting_id: meetingId } });
        const poll = this.pollRepo.create({
            meeting_id: meetingId,
            motion_text: data.motion_text,
            vote_options: data.vote_options,
            facilitator_ename: data.facilitator_ename,
            status: "prepared",
            sort_order: existingCount,
        });
        const saved = await this.pollRepo.save(poll);

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

        await this.pollRepo.update(pollId, { status: "active", opened_at: new Date() });
        const poll = await this.pollRepo.findOneByOrFail({ id: pollId });

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
        await this.pollRepo.update(pollId, { status: "closed", closed_at: now });
        const poll = await this.pollRepo.findOneOrFail({
            where: { id: pollId },
            relations: ["votes"],
        });

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
        await this.pollRepo.update(pollId, data);
        return this.pollRepo.findOneByOrFail({ id: pollId });
    }

    async delete(pollId: string): Promise<void> {
        await this.pollRepo.delete(pollId);
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
            ids.map((id, index) => this.pollRepo.update(id, { sort_order: index }))
        );
        sseService.emit(meetingId, "polls_reordered", { meetingId });
    }
}
