import { AppDataSource } from "../database/data-source";
import { Mandate } from "../database/entities/Mandate";
import { Member } from "../database/entities/Member";
import { Meeting } from "../database/entities/Meeting";
import { Attendee } from "../database/entities/Attendee";
import { ILike } from "typeorm";

export class MandateService {
    private repo = AppDataSource.getRepository(Mandate);

    async create(meetingId: string, data: {
        granter_name: string;
        proxy_name: string;
        scope_note?: string;
    }): Promise<Mandate> {
        const meetingRepo = AppDataSource.getRepository(Meeting);
        const memberRepo = AppDataSource.getRepository(Member);
        const attendeeRepo = AppDataSource.getRepository(Attendee);

        const meeting = await meetingRepo.findOneBy({ id: meetingId });

        // Verify proxy is not an aspirant
        if (meeting) {
            const proxyMember = await memberRepo.findOne({
                where: { community_id: meeting.community_id, name: ILike(data.proxy_name) },
            });
            if (proxyMember?.is_aspirant) {
                throw new Error("Aspirants cannot receive mandates");
            }
        }

        // Look up enames for granter and proxy so identity is preserved even if names change
        let granter_ename: string | undefined;
        let proxy_ename: string | undefined;

        if (meeting?.community_id) {
            const granterMember = await memberRepo.findOne({
                where: { community_id: meeting.community_id, name: ILike(data.granter_name) },
            });
            granter_ename = granterMember?.ename ?? undefined;
        }

        // Proxy must be checked in — grab their ename from the attendee record
        const proxyAttendee = await attendeeRepo.findOne({
            where: { meeting_id: meetingId, attendee_name: ILike(data.proxy_name), status: "checked_in" },
        });
        proxy_ename = proxyAttendee?.attendee_ename ?? undefined;

        // Hard-delete any existing active mandate from this granter (and its mandate vote)
        await this.revokeByGranter(meetingId, data.granter_name);

        const mandate = this.repo.create({
            meeting_id: meetingId,
            granter_name: data.granter_name,
            granter_ename,
            proxy_name: data.proxy_name,
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

    async getActiveMandateForProxy(meetingId: string, proxyName: string): Promise<Mandate[]> {
        return this.repo.find({
            where: { meeting_id: meetingId, proxy_name: proxyName, status: "active" },
        });
    }
}
