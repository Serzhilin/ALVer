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

    /**
     * Resolve the community member for this meeting.
     * Returns null when the meeting has no community (legacy — skip validation).
     * Throws "not_a_member" when community exists but member is not found.
     * Tries ename-first lookup when ename is provided (more reliable than name).
     */
    private async resolveMember(meetingId: string, name: string, ename?: string): Promise<Member | null> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting?.community_id) return null; // legacy meeting — skip validation

        let member: Member | null = null;

        if (ename) {
            member = await this.memberRepo.findOne({
                where: { community_id: meeting.community_id, ename },
            });
        }

        if (!member) {
            member = await this.memberRepo.findOne({
                where: { community_id: meeting.community_id, name: ILike(name) },
            });
        }

        if (!member) throw new Error("not_a_member");
        return member;
    }

    async preRegister(meetingId: string, name: string): Promise<Attendee> {
        const existing = await this.repo.findOne({
            where: { meeting_id: meetingId, attendee_name: name },
        });
        if (existing) return existing;

        // resolveMember throws "not_a_member" when community exists but member not found;
        // returns null for legacy meetings without a community (skip validation).
        const member = await this.resolveMember(meetingId, name);

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

    async checkIn(
        meetingId: string,
        name: string,
        method: "app" | "manual" = "app",
        note?: string,
        ename?: string,
    ): Promise<Attendee> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        // resolveMember now throws for non-members (null = legacy/no-community meeting)
        const member = await this.resolveMember(meetingId, name, ename);

        // Use canonical member name when available — prevents manual/auto name divergence
        const canonicalName = member?.name ?? name;

        // Dedup: try ename first (catches same person with different typed name), then canonical name
        let attendee: Attendee | null = null;

        if (ename) {
            attendee = await this.repo.findOne({
                where: { meeting_id: meetingId, attendee_ename: ename },
            });
        }

        if (!attendee) {
            attendee = await this.repo.findOne({
                where: { meeting_id: meetingId, attendee_name: ILike(canonicalName) },
            });
        }

        if (attendee && attendee.status === "checked_in") {
            // Already checked in — update ename if we now have it and it wasn't stored
            if (ename && !attendee.attendee_ename) {
                await this.repo.update(attendee.id, { attendee_ename: ename });
                attendee = await this.repo.findOneBy({ id: attendee.id }) as Attendee;
            }
            return attendee;
        }

        if (attendee) {
            // Exists (pre-registered or expected) — upgrade to checked_in
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method,
                manual_note: note,
                attendee_name: canonicalName,
                attendee_ename: ename ?? attendee.attendee_ename,
                member_id: member?.id ?? attendee.member_id,
                is_aspirant: member?.is_aspirant ?? attendee.is_aspirant,
            });
            attendee = await this.repo.findOneBy({ id: attendee.id }) as Attendee;
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: member?.id,
                attendee_name: canonicalName,
                attendee_ename: ename,
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
                    const existing = await this.repo.findOne({
                        where: { meeting_id: meetingId, attendee_name: canonicalName },
                    });
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

    async findCheckedInByEname(meetingId: string, ename: string): Promise<Attendee | null> {
        return this.repo.findOne({
            where: { meeting_id: meetingId, attendee_ename: ename, status: "checked_in" },
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
