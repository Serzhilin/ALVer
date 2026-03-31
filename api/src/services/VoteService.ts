import { AppDataSource } from "../database/data-source";
import { Vote, VoteMethod } from "../database/entities/Vote";
import { Poll } from "../database/entities/Poll";
import { Mandate } from "../database/entities/Mandate";
import { sseService } from "./SSEService";

export class VoteService {
    private voteRepo = AppDataSource.getRepository(Vote);
    private pollRepo = AppDataSource.getRepository(Poll);

    async cast(pollId: string, data: {
        voter_name: string;
        option_id: string;
        method?: VoteMethod;
        on_behalf_of_name?: string;
    }): Promise<Vote> {
        const poll = await this.pollRepo.findOneBy({ id: pollId });
        if (!poll) throw new Error("Poll not found");
        if (poll.status !== "active") throw new Error("Poll is not active");

        const validOption = poll.vote_options.find((o) => o.id === data.option_id);
        if (!validOption) throw new Error(`Invalid option_id: ${data.option_id}`);

        // If voting on behalf of someone, verify an active mandate exists
        if (data.on_behalf_of_name) {
            const mandateRepo = AppDataSource.getRepository(Mandate);
            const mandate = await mandateRepo.findOne({
                where: {
                    meeting_id: poll.meeting_id,
                    proxy_name: data.voter_name,
                    granter_name: data.on_behalf_of_name,
                    status: "active",
                },
            });
            if (!mandate) throw new Error("No active mandate found for this voter");
        }

        // Prevent duplicate votes from the same voter (for same context: own vs mandate)
        const existing = await this.voteRepo.findOne({
            where: {
                poll_id: pollId,
                voter_name: data.voter_name,
                on_behalf_of_name: data.on_behalf_of_name ?? null as any,
            },
        });
        if (existing) {
            // Update instead of duplicate
            await this.voteRepo.update(existing.id, { option_id: data.option_id });
            return this.voteRepo.findOneByOrFail({ id: existing.id });
        }

        const vote = this.voteRepo.create({
            poll_id: pollId,
            meeting_id: poll.meeting_id,
            voter_name: data.voter_name,
            option_id: data.option_id,
            cast_at: new Date(),
            method: data.method ?? "app",
            on_behalf_of_name: data.on_behalf_of_name,
        });
        const saved = await this.voteRepo.save(vote);

        // Count total votes (no breakdown while open)
        const count = await this.voteRepo.count({ where: { poll_id: pollId } });
        sseService.emit(poll.meeting_id, "vote_cast", { meetingId: poll.meeting_id, pollId, count });

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('vote', saved.id, saved);

        return saved;
    }

    async getCount(pollId: string): Promise<number> {
        return this.voteRepo.count({ where: { poll_id: pollId } });
    }

    async getResults(pollId: string): Promise<{ breakdown: { option_id: string; label: string; count: number }[]; total: number } | null> {
        const poll = await this.pollRepo.findOne({ where: { id: pollId }, relations: ["votes"] });
        if (!poll || poll.status !== "closed") return null;

        const tally: Record<string, number> = {};
        for (const opt of poll.vote_options) tally[opt.id] = 0;
        for (const v of poll.votes) {
            if (tally[v.option_id] !== undefined) tally[v.option_id]++;
        }

        return {
            breakdown: poll.vote_options.map((o) => ({ option_id: o.id, label: o.label, count: tally[o.id] ?? 0 })),
            total: poll.votes.length,
        };
    }

    async hasVoted(pollId: string, voterName: string, onBehalfOf?: string): Promise<boolean> {
        const vote = await this.voteRepo.findOne({
            where: {
                poll_id: pollId,
                voter_name: voterName,
                on_behalf_of_name: onBehalfOf ?? null as any,
            },
        });
        return !!vote;
    }
}
