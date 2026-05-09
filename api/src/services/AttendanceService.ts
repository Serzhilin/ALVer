import { AppDataSource } from "../database/data-source";
import { MeetingAttendanceRecord } from "../database/entities/MeetingAttendanceRecord";
import { Attendee } from "../database/entities/Attendee";
import { Mandate } from "../database/entities/Mandate";
import { Member } from "../database/entities/Member";
import { Meeting } from "../database/entities/Meeting";

export class AttendanceService {
    private repo = AppDataSource.getRepository(MeetingAttendanceRecord);

    /**
     * Snapshot attendance for every community member at the moment of archiving.
     * Idempotent: safe to call multiple times (upserts by meeting_id + ename/name).
     */
    async recordForMeeting(meetingId: string): Promise<void> {
        const meetingRepo  = AppDataSource.getRepository(Meeting);
        const attendeeRepo = AppDataSource.getRepository(Attendee);
        const mandateRepo  = AppDataSource.getRepository(Mandate);
        const memberRepo   = AppDataSource.getRepository(Member);

        const meeting = await meetingRepo.findOneBy({ id: meetingId });
        if (!meeting?.community_id) return; // legacy meeting without community — skip

        const members   = await memberRepo.find({ where: { community_id: meeting.community_id } });
        const attendees = await attendeeRepo.find({ where: { meeting_id: meetingId, status: "checked_in" } });
        const mandates  = await mandateRepo.find({ where: { meeting_id: meetingId, status: "active" } });

        // Build lookup sets — ename-first, name fallback
        const checkedInEnames = new Set(
            attendees.filter(a => a.attendee_ename).map(a => a.attendee_ename!.toLowerCase())
        );
        const checkedInNames = new Set(attendees.map(a => a.attendee_name.toLowerCase()));

        // Index mandates by granter identity
        const mandateByGranterEname = new Map(
            mandates.filter(m => m.granter_ename).map(m => [m.granter_ename!.toLowerCase(), m])
        );
        const mandateByGranterName = new Map(
            mandates.map(m => [m.granter_name.toLowerCase(), m])
        );

        const records: Omit<MeetingAttendanceRecord, "id" | "meeting" | "recorded_at">[] = [];

        for (const member of members) {
            const ename = member.ename?.toLowerCase();
            const nameLower = member.name.toLowerCase();

            const isPresent =
                (ename ? checkedInEnames.has(ename) : false) ||
                checkedInNames.has(nameLower);

            if (isPresent) {
                records.push({
                    meeting_id: meetingId,
                    community_id: meeting.community_id,
                    member_ename: member.ename,
                    member_name: member.name,
                    is_aspirant: member.is_aspirant,
                    status: "attended",
                    proxy_ename: null!,
                    proxy_name: null!,
                });
                continue;
            }

            // Check for active mandate (granter absent)
            const mandate = (ename ? mandateByGranterEname.get(ename) : null)
                ?? mandateByGranterName.get(nameLower);

            if (mandate) {
                records.push({
                    meeting_id: meetingId,
                    community_id: meeting.community_id,
                    member_ename: member.ename,
                    member_name: member.name,
                    is_aspirant: member.is_aspirant,
                    status: "mandated",
                    proxy_ename: mandate.proxy_ename,
                    proxy_name: mandate.proxy_name,
                });
            } else {
                records.push({
                    meeting_id: meetingId,
                    community_id: meeting.community_id,
                    member_ename: member.ename,
                    member_name: member.name,
                    is_aspirant: member.is_aspirant,
                    status: "absent",
                    proxy_ename: null!,
                    proxy_name: null!,
                });
            }
        }

        // Upsert: skip if records already exist for this meeting
        const existing = await this.repo.count({ where: { meeting_id: meetingId } });
        if (existing > 0) return;

        if (records.length > 0) {
            await this.repo.insert(records as MeetingAttendanceRecord[]);
        }
    }

    async getForMeeting(meetingId: string): Promise<MeetingAttendanceRecord[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { status: "ASC", member_name: "ASC" },
        });
    }

    async getForCommunity(communityId: string): Promise<MeetingAttendanceRecord[]> {
        return this.repo.find({
            where: { community_id: communityId },
            order: { recorded_at: "DESC", member_name: "ASC" },
        });
    }
}
