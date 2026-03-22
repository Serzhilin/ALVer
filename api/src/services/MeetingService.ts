import { AppDataSource } from "../database/data-source";
import { Meeting, MeetingStatus } from "../database/entities/Meeting";
import { sseService } from "./SSEService";

export class MeetingService {
    private repo = AppDataSource.getRepository(Meeting);

    async create(data: {
        name: string;
        date: string;
        time: string;
        location: string;
        agenda_text: string;
        facilitator_name?: string;
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

    async findAll(): Promise<Meeting[]> {
        return this.repo.find({ order: { created_at: "DESC" } });
    }

    async update(id: string, data: Partial<Meeting>): Promise<Meeting> {
        await this.repo.update(id, data);
        const updated = await this.findById(id);
        if (!updated) throw new Error("Meeting not found");

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('meeting', id, updated);

        return updated;
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

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('meeting', id, updated);

        return updated;
    }

    private isValidTransition(from: MeetingStatus, to: MeetingStatus): boolean {
        const allowed: Record<MeetingStatus, MeetingStatus[]> = {
            draft: ["published"],
            published: ["open", "draft"],
            open: ["in_session", "published"],
            in_session: ["closed"],
            closed: ["archived"],
            archived: [],
        };
        return allowed[from]?.includes(to) ?? false;
    }
}
