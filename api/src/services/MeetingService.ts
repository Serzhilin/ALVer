import { AppDataSource } from "../database/data-source";
import { Meeting, MeetingStatus } from "../database/entities/Meeting";
import { sseService } from "./SSEService";

export class MeetingService {
    private repo = AppDataSource.getRepository(Meeting);
    private displayModes = new Map<string, string>()

    setDisplayMode(meetingId: string, mode: string): void {
        this.displayModes.set(meetingId, mode)
    }

    getDisplayMode(meetingId: string): string {
        return this.displayModes.get(meetingId) ?? 'numbers'
    }

    async create(data: {
        name: string;
        date: string;
        time: string;
        location: string;
        agenda_text: string;
        facilitator_name?: string;
        community_id?: string;
    }): Promise<Meeting> {
        const meeting = this.repo.create({
            ...data,
            status: "draft",
        });
        const saved = await this.repo.save(meeting);

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('meeting', saved.id, saved);

        return saved;
    }

    async findById(id: string): Promise<Meeting | null> {
        return this.repo.findOne({
            where: { id },
            relations: ["attendees", "mandates", "polls", "polls.votes"],
        });
    }

    async findAll(communityId?: string): Promise<Meeting[]> {
        const where = communityId ? { community_id: communityId } : {};
        const meetings = await this.repo.find({ where, order: { created_at: "DESC" } });

        // Auto-archive meetings whose date has passed and are still open/in_session
        const today = new Date().toISOString().slice(0, 10);
        // Only auto-archive announced (open) meetings from past dates.
        // in_session meetings must be explicitly closed by the facilitator.
        const stale = meetings.filter(
            m => m.status === "open" && m.date < today
        );
        if (stale.length > 0) {
            await Promise.all(stale.map(m => this.repo.update(m.id, { status: "archived" })));
            stale.forEach(m => { m.status = "archived"; });
        }

        return meetings;
    }

    async update(id: string, data: Partial<Meeting>): Promise<Meeting> {
        await this.repo.update(id, data);
        const updated = await this.findById(id);
        if (!updated) throw new Error("Meeting not found");

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('meeting', id, updated);

        return updated;
    }

    async delete(id: string): Promise<void> {
        const meeting = await this.repo.findOneBy({ id });
        if (!meeting) throw new Error("Meeting not found");
        await this.repo.delete(id);
    }

    async transitionStatus(id: string, status: MeetingStatus): Promise<Meeting> {
        const meeting = await this.repo.findOneBy({ id });
        if (!meeting) throw new Error("Meeting not found");

        const valid = this.isValidTransition(meeting.status, status);
        if (!valid) {
            throw new Error(`Invalid status transition: ${meeting.status} → ${status}`);
        }

        await this.repo.update(id, { status });
        const updated = await this.findById(id);
        if (!updated) throw new Error("Meeting not found after update");

        sseService.emit(id, "meeting_status_changed", { meetingId: id, status });
        if (status === 'archived') this.displayModes.delete(id)

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('meeting', id, updated);

        return updated;
    }

    async reopen(id: string): Promise<Meeting> {
        const meeting = await this.repo.findOneBy({ id });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status !== "archived") throw new Error("Only archived meetings can be reopened");
        const today = new Date().toISOString().slice(0, 10);
        if (meeting.date !== today) throw new Error("Can only reopen a meeting on its scheduled date");
        await this.repo.update(id, { status: "in_session" });
        const updated = await this.findById(id);
        if (!updated) throw new Error("Meeting not found after update");
        sseService.emit(id, "meeting_status_changed", { meetingId: id, status: "in_session" });
        this.displayModes.delete(id)
        return updated;
    }

    private isValidTransition(from: MeetingStatus, to: MeetingStatus): boolean {
        const allowed: Record<MeetingStatus, MeetingStatus[]> = {
            draft: ["open"],
            open: ["in_session"],
            in_session: ["archived"],
            archived: [],
            closed: [],
        };
        return allowed[from]?.includes(to) ?? false;
    }
}
