import { AppDataSource } from "../database/data-source";
import { Attendee } from "../database/entities/Attendee";
import { sseService } from "./SSEService";

export class AttendeeService {
    private repo = AppDataSource.getRepository(Attendee);

    async preRegister(meetingId: string, name: string): Promise<Attendee> {
        // Idempotent: return existing if already registered
        const existing = await this.repo.findOne({
            where: { meeting_id: meetingId, attendee_name: name },
        });
        if (existing) return existing;

        const attendee = this.repo.create({
            meeting_id: meetingId,
            attendee_name: name,
            status: "expected",
            pre_registered_at: new Date(),
            method: "app",
        });
        const saved = await this.repo.save(attendee);

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('attendee', saved.id, saved);

        return saved;
    }

    async checkIn(meetingId: string, name: string, method: "app" | "manual" = "app", note?: string): Promise<Attendee> {
        let attendee = await this.repo.findOne({
            where: { meeting_id: meetingId, attendee_name: name },
        });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method,
                manual_note: note,
            });
            attendee = await this.repo.findOneBy({ id: attendee.id }) as Attendee;
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                attendee_name: name,
                status: "checked_in",
                checked_in_at: new Date(),
                method,
                manual_note: note,
            });
            attendee = await this.repo.save(attendee);
        }

        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: { id: attendee.id, name: attendee.attendee_name, method: attendee.method },
        });

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('attendee', attendee.id, attendee);

        return attendee;
    }

    async listForMeeting(meetingId: string): Promise<Attendee[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { checked_in_at: "ASC" },
        });
    }

    async findByName(meetingId: string, name: string): Promise<Attendee | null> {
        return this.repo.findOne({ where: { meeting_id: meetingId, attendee_name: name } });
    }

    async update(attendeeId: string, data: Partial<Attendee>): Promise<Attendee> {
        await this.repo.update(attendeeId, data);
        return this.repo.findOneByOrFail({ id: attendeeId });
    }
}
