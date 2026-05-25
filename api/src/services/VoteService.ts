import { AppDataSource } from "../database/data-source";
import { IsNull } from "typeorm";
import { Vote, VoteMethod } from "../database/entities/Vote";
import { Poll } from "../database/entities/Poll";
import { Mandate } from "../database/entities/Mandate";
import { Attendee } from "../database/entities/Attendee";
import { sseService } from "./SSEService";
import { PollService } from "./PollService";

export class VoteService {
    private voteRepo = AppDataSource.getRepository(Vote);
    private pollRepo = AppDataSource.getRepository(Poll);

    async cast(pollId: string, data: {
        voter_name: string;
        option_id: string;
        method?: VoteMethod;
        on_behalf_of_name?: string;
        voter_ename?: string;
        voter_member_id?: string;
    }): Promise<Vote> {
        const poll = await this.pollRepo.findOneBy({ id: pollId });
        if (!poll) throw new Error("Poll not found");
        if (poll.status !== "active") throw new Error("Poll is not active");

        const validOption = poll.vote_options.find((o) => o.id === data.option_id);
        if (!validOption) throw new Error(`Invalid option_id: ${data.option_id}`);

        // Verify voter is checked in and not an aspirant (manual votes skip — facilitator is responsible)
        let checkedInAttendee: Attendee | null = null;
        if (data.method !== "manual") {
            const attendeeRepo = AppDataSource.getRepository(Attendee);

            if (data.voter_ename) {
                checkedInAttendee = await attendeeRepo.findOne({
                    where: { meeting_id: poll.meeting_id, attendee_ename: data.voter_ename, status: "checked_in" },
                });
            }
            if (!checkedInAttendee && data.voter_member_id) {
                checkedInAttendee = await attendeeRepo.findOne({
                    where: { meeting_id: poll.meeting_id, member_id: data.voter_member_id, status: "checked_in" },
                });
            }
            if (!checkedInAttendee) throw new Error("not_checked_in");
            if (checkedInAttendee.is_aspirant) throw new Error("aspirants_cannot_vote");
        }

        // Verify mandate exists when voting on behalf; capture granter ename for the vote record
        let on_behalf_of_ename: string | undefined;
        if (data.on_behalf_of_name) {
            const mandateRepo = AppDataSource.getRepository(Mandate);
            // Try ename-first match, fall back to name match
            const whereConditions: any[] = [];
            if (data.voter_ename) {
                whereConditions.push({
                    meeting_id: poll.meeting_id,
                    proxy_ename: data.voter_ename,
                    granter_name: data.on_behalf_of_name,
                    status: "active",
                });
            }
            whereConditions.push({
                meeting_id: poll.meeting_id,
                proxy_name: data.voter_name,
                granter_name: data.on_behalf_of_name,
                status: "active",
            });

            const mandate = await mandateRepo.findOne({ where: whereConditions });
            if (!mandate) throw new Error("No active mandate found for this voter");
            on_behalf_of_ename = mandate.granter_ename ?? undefined;
        }

        // Dedup: ename-first, member_id fallback
        let existing: Vote | null = null;
        if (data.voter_ename) {
            existing = await this.voteRepo.findOne({
                where: {
                    poll_id: pollId,
                    voter_ename: data.voter_ename,
                    on_behalf_of_name: data.on_behalf_of_name ?? IsNull(),
                },
            });
        }
        if (!existing && data.voter_member_id) {
            existing = await this.voteRepo.findOne({
                where: {
                    poll_id: pollId,
                    voter_member_id: data.voter_member_id,
                    on_behalf_of_name: data.on_behalf_of_name ?? IsNull(),
                },
            });
        }
        if (existing) {
            await this.voteRepo.update(existing.id, {
                option_id: data.option_id,
                voter_ename: data.voter_ename ?? existing.voter_ename,
                on_behalf_of_ename: on_behalf_of_ename ?? existing.on_behalf_of_ename,
            });
            return this.voteRepo.findOneByOrFail({ id: existing.id });
        }

        const vote = this.voteRepo.create({
            poll_id: pollId,
            meeting_id: poll.meeting_id,
            voter_name: data.voter_name,
            voter_ename: data.voter_ename,
            voter_member_id: checkedInAttendee?.member_id ?? data.voter_member_id ?? null,
            option_id: data.option_id,
            cast_at: new Date(),
            method: data.method ?? "app",
            on_behalf_of_name: data.on_behalf_of_name,
            on_behalf_of_ename,
        });
        const saved = await this.voteRepo.save(vote);

        const count = await this.voteRepo.count({ where: { poll_id: pollId } });
        sseService.emit(poll.meeting_id, "vote_cast", { meetingId: poll.meeting_id, pollId, count });

        await this.autoCloseIfComplete(poll);

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

    private async autoCloseIfComplete(poll: Poll): Promise<void> {
        const attendeeRepo = AppDataSource.getRepository(Attendee);
        const mandateRepo  = AppDataSource.getRepository(Mandate);

        // Eligible = non-aspirant checked-in + mandates from absent granters
        const checkedIn = await attendeeRepo.find({
            where: { meeting_id: poll.meeting_id, status: "checked_in", is_aspirant: false },
        });
        // Build sets for both identity strategies
        const checkedInEnames = new Set(checkedIn.filter(a => a.attendee_ename).map(a => a.attendee_ename!.toLowerCase()));
        const checkedInNames  = new Set(checkedIn.map(a => a.attendee_name.toLowerCase()));

        const mandates = await mandateRepo.find({
            where: { meeting_id: poll.meeting_id, status: "active" },
        });

        // Mandate counts only when: granter is absent AND proxy has checked in
        const unbodiedMandates = mandates.filter(m => {
            const granterPresent =
                (m.granter_ename && checkedInEnames.has(m.granter_ename.toLowerCase())) ||
                checkedInNames.has(m.granter_name.toLowerCase());
            const proxyPresent =
                (m.proxy_ename && checkedInEnames.has(m.proxy_ename.toLowerCase())) ||
                checkedInNames.has(m.proxy_name.toLowerCase());
            return !granterPresent && proxyPresent;
        });
        const eligible = checkedIn.length + unbodiedMandates.length;
        if (eligible === 0) return;

        // Cast = own votes + unique on-behalf votes; dedup by ename when available
        const allVotes = await this.voteRepo.find({ where: { poll_id: poll.id } });
        const ownVoters = new Set(
            allVotes
                .filter(v => !v.on_behalf_of_name)
                .map(v => v.voter_ename ? `e:${v.voter_ename.toLowerCase()}` : `n:${v.voter_name.toLowerCase()}`)
        );
        const behalfGranters = new Set(
            allVotes
                .filter(v => v.on_behalf_of_name)
                .map(v => v.on_behalf_of_ename ? `e:${v.on_behalf_of_ename.toLowerCase()}` : `n:${v.on_behalf_of_name.toLowerCase()}`)
        );
        const totalCast = ownVoters.size + behalfGranters.size;

        if (totalCast >= eligible) {
            const pollService = new PollService();
            await pollService.close(poll.id, poll.meeting_id);
        }
    }

    async deleteVote(voteId: string): Promise<void> {
        await this.voteRepo.delete(voteId);
    }

    async hasVoted(pollId: string, voterName: string, onBehalfOf?: string, voterEname?: string): Promise<boolean> {
        if (voterEname) {
            const byEname = await this.voteRepo.findOne({
                where: {
                    poll_id: pollId,
                    voter_ename: voterEname,
                    on_behalf_of_name: onBehalfOf ?? IsNull(),
                },
            });
            if (byEname) return true;
        }
        const vote = await this.voteRepo.findOne({
            where: {
                poll_id: pollId,
                voter_name: voterName,
                on_behalf_of_name: onBehalfOf ?? IsNull(),
            },
        });
        return !!vote;
    }
}
