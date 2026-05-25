import { AppDataSource } from "../database/data-source";
import { Attendee } from "../database/entities/Attendee";
import { Meeting } from "../database/entities/Meeting";
import { Member } from "../database/entities/Member";
import { sseService } from "./SSEService";
import { appDisplayName } from "../lib/member-display";

export class AttendeeService {
    private repo = AppDataSource.getRepository(Attendee);
    private meetingRepo = AppDataSource.getRepository(Meeting);
    private memberRepo = AppDataSource.getRepository(Member);

    /** W3DS self-check-in: person identified by their ename from JWT */
    async checkInByEname(meetingId: string, ename: string): Promise<Attendee> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        const member = meeting.community_id
            ? await this.memberRepo.findOne({ where: { community_id: meeting.community_id, ename } })
            : null;

        if (meeting.community_id && !member) throw new Error("not_a_member");

        const name = member ? appDisplayName(member) : ename;

        // Dedup: already checked in by ename?
        let attendee = await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: ename } });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method: "app",
                attendee_name: name,
                attendee_ename: ename,
                member_id: member?.id ?? attendee.member_id,
                is_aspirant: member?.is_aspirant ?? attendee.is_aspirant,
            });
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: member?.id ?? undefined,
                attendee_name: name,
                attendee_ename: ename,
                is_aspirant: member?.is_aspirant ?? false,
                status: "checked_in",
                checked_in_at: new Date(),
                method: "app",
            });
            try {
                attendee = await this.repo.save(attendee);
            } catch (e: any) {
                if (e.code === "23505") {
                    const existing = await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: ename } });
                    if (existing) return existing;
                }
                throw e;
            }
        }

        attendee = await this.repo.findOneByOrFail({ id: attendee.id });
        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: { id: attendee.id, name: attendee.attendee_name, method: attendee.method, is_aspirant: attendee.is_aspirant },
        });
        return attendee;
    }

    /** Facilitator manual check-in: person identified by member_id UUID */
    async checkInByMemberId(meetingId: string, memberId: string, note?: string): Promise<Attendee> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        const member = await this.memberRepo.findOneByOrFail({ id: memberId });
        const name = appDisplayName(member);

        // Dedup: already checked in via ename or member_id?
        let attendee = member.ename
            ? await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: member.ename } })
            : await this.repo.findOne({ where: { meeting_id: meetingId, member_id: memberId } });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method: "manual",
                manual_note: note,
                attendee_name: name,
                attendee_ename: member.ename ?? attendee.attendee_ename,
                member_id: memberId,
                is_aspirant: member.is_aspirant,
            });
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: memberId,
                attendee_name: name,
                attendee_ename: member.ename ?? undefined,
                is_aspirant: member.is_aspirant,
                status: "checked_in",
                checked_in_at: new Date(),
                method: "manual",
                manual_note: note,
            });
            attendee = await this.repo.save(attendee);
        }

        attendee = await this.repo.findOneByOrFail({ id: attendee.id });
        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: { id: attendee.id, name: attendee.attendee_name, method: attendee.method, is_aspirant: attendee.is_aspirant },
        });
        return attendee;
    }

    async listForMeeting(meetingId: string): Promise<Attendee[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { checked_in_at: "ASC" },
        });
    }

    async findCheckedInByEname(meetingId: string, ename: string): Promise<Attendee | null> {
        return this.repo.findOne({
            where: { meeting_id: meetingId, attendee_ename: ename, status: "checked_in" },
        });
    }

    async findCheckedInByMemberId(meetingId: string, memberId: string): Promise<Attendee | null> {
        return this.repo.findOne({
            where: { meeting_id: meetingId, member_id: memberId, status: "checked_in" },
        });
    }

    async update(attendeeId: string, data: Partial<Attendee>): Promise<Attendee> {
        await this.repo.update(attendeeId, data);
        return this.repo.findOneByOrFail({ id: attendeeId });
    }

    async delete(attendeeId: string): Promise<void> {
        await this.repo.delete(attendeeId);
    }
}
