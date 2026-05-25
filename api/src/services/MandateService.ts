import { AppDataSource } from "../database/data-source";
import { Mandate } from "../database/entities/Mandate";
import { Member } from "../database/entities/Member";
import { Meeting } from "../database/entities/Meeting";
import { Attendee } from "../database/entities/Attendee";
import { appDisplayName } from "../lib/member-display";

export class MandateService {
    private repo = AppDataSource.getRepository(Mandate);

    async create(meetingId: string, data: {
        granter_ename: string;
        proxy_member_id: string;
        scope_note?: string;
    }): Promise<Mandate> {
        const meetingRepo = AppDataSource.getRepository(Meeting);
        const memberRepo = AppDataSource.getRepository(Member);
        const attendeeRepo = AppDataSource.getRepository(Attendee);

        // 1. Find meeting
        const meeting = await meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) {
            throw new Error("Meeting not found");
        }

        // 2. Find proxyMember by proxy_member_id
        const proxyMember = await memberRepo.findOneByOrFail({ id: data.proxy_member_id });

        // 3. Throw if proxy is aspirant
        if (proxyMember.is_aspirant) {
            throw new Error("Aspirants cannot receive mandates");
        }

        // 4. Find granterMember by ename (may be null)
        const granterMember = await memberRepo.findOne({
            where: { community_id: meeting.community_id, ename: data.granter_ename },
        });

        // 5. Compute display names
        const granter_name = granterMember ? appDisplayName(granterMember) : data.granter_ename;
        const proxy_name = appDisplayName(proxyMember);
        const proxy_ename = proxyMember.ename ?? undefined;

        // 6. Verify proxy is checked in
        let proxyCheckedIn: Attendee | null = null;
        if (proxyMember.ename) {
            proxyCheckedIn = await attendeeRepo.findOne({
                where: { meeting_id: meetingId, attendee_ename: proxyMember.ename, status: "checked_in" },
            });
        } else {
            proxyCheckedIn = await attendeeRepo.findOne({
                where: { meeting_id: meetingId, member_id: proxyMember.id, status: "checked_in" },
            });
        }
        if (!proxyCheckedIn) {
            throw new Error("Proxy must be checked in to the meeting");
        }

        // 7. Revoke existing active mandate from this granter
        await this.revokeByGranterEname(meetingId, data.granter_ename);

        // 8. Create and save mandate
        const mandate = this.repo.create({
            meeting_id: meetingId,
            granter_name,
            granter_ename: data.granter_ename,
            proxy_name,
            proxy_ename,
            scope_note: data.scope_note,
            status: "active",
            granted_at: new Date(),
        });
        return this.repo.save(mandate);
    }

    async listForMeeting(meetingId: string): Promise<Mandate[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { granted_at: "ASC" },
        });
    }

    async revoke(mandateId: string): Promise<void> {
        const mandate = await this.repo.findOneByOrFail({ id: mandateId });
        // Hard delete: remove mandate and any mandate vote cast on behalf of this granter
        const voteRepo = AppDataSource.getRepository((await import("../database/entities/Vote")).Vote);
        await voteRepo.delete({
            meeting_id: mandate.meeting_id,
            on_behalf_of_name: mandate.granter_name,
        });
        await this.repo.delete(mandateId);
    }

    async revokeByGranter(meetingId: string, granterName: string): Promise<void> {
        const mandates = await this.repo.find({
            where: { meeting_id: meetingId, granter_name: granterName, status: "active" },
        });
        for (const m of mandates) {
            await this.revoke(m.id);
        }
    }

    async revokeByGranterEname(meetingId: string, granterEname: string): Promise<void> {
        const mandates = await this.repo.find({
            where: { meeting_id: meetingId, granter_ename: granterEname, status: "active" },
        });
        for (const m of mandates) {
            await this.repo.delete(m.id);
        }
    }

    async getActiveMandateForProxy(meetingId: string, proxyName: string): Promise<Mandate[]> {
        return this.repo.find({
            where: { meeting_id: meetingId, proxy_name: proxyName, status: "active" },
        });
    }
}
