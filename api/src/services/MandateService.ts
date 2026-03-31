import { AppDataSource } from "../database/data-source";
import { Mandate } from "../database/entities/Mandate";
import { Member } from "../database/entities/Member";
import { Meeting } from "../database/entities/Meeting";

export class MandateService {
    private repo = AppDataSource.getRepository(Mandate);

    async create(meetingId: string, data: {
        granter_name: string;
        proxy_name: string;
        scope_note?: string;
    }): Promise<Mandate> {
        // Verify proxy is not an aspirant
        const meetingRepo = AppDataSource.getRepository(Meeting);
        const memberRepo = AppDataSource.getRepository(Member);
        const meeting = await meetingRepo.findOneBy({ id: meetingId });
        if (meeting) {
            const proxyMember = await memberRepo.findOne({
                where: { community_id: meeting.community_id, name: data.proxy_name },
            });
            if (proxyMember?.is_aspirant) {
                throw new Error("Aspirants cannot receive mandates");
            }
        }

        // Revoke any existing active mandate from this granter
        await this.repo.update(
            { meeting_id: meetingId, granter_name: data.granter_name, status: "active" },
            { status: "revoked", revoked_at: new Date() }
        );

        const mandate = this.repo.create({
            meeting_id: meetingId,
            granter_name: data.granter_name,
            proxy_name: data.proxy_name,
            scope_note: data.scope_note,
            status: "active",
            granted_at: new Date(),
        });
        const saved = await this.repo.save(mandate);

        // W3DS SYNC HOOK — to be implemented
        // await web3Adapter.sync('mandate', saved.id, saved);

        return saved;
    }

    async listForMeeting(meetingId: string): Promise<Mandate[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { granted_at: "ASC" },
        });
    }

    async revoke(mandateId: string): Promise<Mandate> {
        await this.repo.update(mandateId, { status: "revoked", revoked_at: new Date() });
        return this.repo.findOneByOrFail({ id: mandateId });
    }

    async revokeByGranter(meetingId: string, granterName: string): Promise<void> {
        await this.repo.update(
            { meeting_id: meetingId, granter_name: granterName, status: "active" },
            { status: "revoked", revoked_at: new Date() }
        );
    }

    async getActiveMandateForProxy(meetingId: string, proxyName: string): Promise<Mandate[]> {
        return this.repo.find({
            where: { meeting_id: meetingId, proxy_name: proxyName, status: "active" },
        });
    }
}
