import { AppDataSource } from "../database/data-source";
import { ILike } from "typeorm";
import { Attendee } from "../database/entities/Attendee";
import { Meeting } from "../database/entities/Meeting";
import { Member } from "../database/entities/Member";
import { sseService } from "./SSEService";

export class AttendeeService {
    private repo = AppDataSource.getRepository(Attendee);
    private meetingRepo = AppDataSource.getRepository(Meeting);
    private memberRepo = AppDataSource.getRepository(Member);

    /** Resolve the community member for this meeting + name. Throws if not a member. */
    private async resolveMember(meetingId: string, name: string): Promise<Member | null> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting?.community_id) return null; // legacy meeting without community — skip validation
        return this.memberRepo.findOne({
            where: { community_id: meeting.community_id, name },
        });
    }

    async preRegister(meetingId: string, name: string): Promise<Attendee> {
        const existing = await this.repo.findOne({
            where: { meeting_id: meetingId, attendee_name: name },
        });
        if (existing) return existing;

        const member = await this.resolveMember(meetingId, name);
        if (member === undefined) {
            // community exists but member not found
            throw new Error("not_a_member");
        }

        const attendee = this.repo.create({
            meeting_id: meetingId,
            member_id: member?.id,
            attendee_name: name,
            is_aspirant: member?.is_aspirant ?? false,
            status: "expected",
            pre_registered_at: new Date(),
            method: "app",
        });
        const saved = await this.repo.save(attendee);
        sseService.emit(meetingId, "attendee_pre_registered", { meetingId, name });
        return saved;
    }

    async checkIn(meetingId: string, name: string, method: "app" | "manual" = "app", note?: string): Promise<Attendee> {
        // BUG-2: validate meeting is accepting check-ins
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        const member = await this.resolveMember(meetingId, name);
        if (member === undefined) {
            throw new Error("not_a_member");
        }

        // BUG-1: case-insensitive duplicate check
        let attendee = await this.repo.findOne({
            where: { meeting_id: meetingId, attendee_name: ILike(name) },
        });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method,
                manual_note: note,
                member_id: member?.id ?? attendee.member_id,
                is_aspirant: member?.is_aspirant ?? attendee.is_aspirant,
            });
            attendee = await this.repo.findOneBy({ id: attendee.id }) as Attendee;
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: member?.id,
                attendee_name: name,
                is_aspirant: member?.is_aspirant ?? false,
                status: "checked_in",
                checked_in_at: new Date(),
                method,
                manual_note: note,
            });
            try {
                attendee = await this.repo.save(attendee);
            } catch (e: any) {
                // Unique constraint violation — concurrent request already inserted; return existing
                if (e.code === "23505") {
                    const existing = await this.repo.findOne({ where: { meeting_id: meetingId, attendee_name: name } });
                    if (existing) return existing;
                }
                throw e;
            }
        }

        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: {
                id: attendee.id,
                name: attendee.attendee_name,
                method: attendee.method,
                is_aspirant: attendee.is_aspirant,
            },
        });

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

    async delete(attendeeId: string): Promise<void> {
        await this.repo.delete(attendeeId);
    }
}
