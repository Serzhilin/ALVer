import { AppDataSource } from "../database/data-source";
import { Poll, VoteOption } from "../database/entities/Poll";
import { Vote } from "../database/entities/Vote";
import { Decision } from "../database/entities/Decision";
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
        const poll = this.pollRepo.create({
            meeting_id: meetingId,
            motion_text: data.motion_text,
            vote_options: data.vote_options,
            facilitator_ename: data.facilitator_ename,
            status: "prepared",
        });
        const saved = await this.pollRepo.save(poll);

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('poll', saved.id, saved);

        return saved;
    }

    async listForMeeting(meetingId: string): Promise<Poll[]> {
        return this.pollRepo.find({
            where: { meeting_id: meetingId },
            relations: ["votes"],
            order: { created_at: "ASC" },
        });
    }

    async findById(pollId: string): Promise<Poll | null> {
        return this.pollRepo.findOne({
            where: { id: pollId },
            relations: ["votes"],
        });
    }

    async open(pollId: string, meetingId: string): Promise<Poll> {
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

        // Determine result: "voor" or "ja" winning = aangenomen
        const maxCount = Math.max(...Object.values(tally));
        const winner = poll.vote_options.find((o) => (tally[o.id] ?? 0) === maxCount);
        const winnerIdLower = (winner?.id ?? "").toLowerCase();
        const aangenomen =
            winnerIdLower === "voor" || winnerIdLower === "ja" || winnerIdLower === "yes";

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
}
