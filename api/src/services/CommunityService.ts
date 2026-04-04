import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
import { Member } from "../database/entities/Member";

export class CommunityService {
    private repo = AppDataSource.getRepository(Community);
    private memberRepo = AppDataSource.getRepository(Member);

    /** Returns branding fields for the single community in this installation */
    async getFirstBranding(): Promise<Pick<Community, "name" | "logo_url" | "primary_color" | "title_font"> | null> {
        const c = await this.repo.findOne({ where: {}, select: ["name", "logo_url", "primary_color", "title_font"] });
        return c ?? null;
    }

    async findByFacilitatorEname(ename: string): Promise<Community | null> {
        return this.repo.findOne({
            where: { facilitator_ename: ename },
            relations: ["members"],
        });
    }

    async findById(id: string): Promise<Community | null> {
        return this.repo.findOne({
            where: { id },
            relations: ["members"],
        });
    }

    async update(id: string, data: Partial<Pick<Community, "name" | "logo_url" | "locations" | "primary_color" | "title_font">>): Promise<Community> {
        const community = await this.repo.findOneByOrFail({ id });
        Object.assign(community, data);
        await this.repo.save(community);
        return (await this.findById(id))!;
    }

    // ── Members ───────────────────────────────────────────────────────────────

    async getMembers(communityId: string): Promise<Member[]> {
        return this.memberRepo.find({
            where: { community_id: communityId },
            order: { name: "ASC" },
        });
    }

    async getMemberById(memberId: string): Promise<Member | null> {
        return this.memberRepo.findOne({ where: { id: memberId } });
    }

    async findMemberByName(communityId: string, name: string): Promise<Member | null> {
        return this.memberRepo.findOne({
            where: { community_id: communityId, name },
        });
    }

    async findMemberByEname(communityId: string, ename: string): Promise<Member | null> {
        return this.memberRepo.findOne({ where: { community_id: communityId, ename } });
    }

    /** Find community by member ename — used to load branding for non-facilitator users */
    async findByMemberEname(ename: string): Promise<Community | null> {
        const member = await this.memberRepo.findOne({ where: { ename } });
        if (!member) return null;
        return this.repo.findOne({ where: { id: member.community_id }, relations: ["members"] });
    }

    async createMember(communityId: string, data: {
        first_name: string;
        last_name: string;
        email?: string;
        phone?: string;
        ename?: string;
        is_aspirant?: boolean;
        is_facilitator?: boolean;
    }): Promise<Member> {
        const name = `${data.first_name.trim()} ${data.last_name.trim()}`;
        const member = this.memberRepo.create({
            community_id: communityId,
            name,
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            email: data.email,
            phone: data.phone,
            ename: data.ename,
            is_aspirant: data.is_aspirant ?? false,
            is_facilitator: data.is_facilitator ?? false,
        });
        return this.memberRepo.save(member);
    }

    async updateMember(id: string, data: Partial<Pick<Member, "first_name" | "last_name" | "name" | "email" | "phone" | "ename" | "is_aspirant" | "is_facilitator">>): Promise<Member> {
        const member = await this.memberRepo.findOneByOrFail({ id });
        Object.assign(member, data);
        if (data.first_name !== undefined || data.last_name !== undefined) {
            member.name = `${member.first_name?.trim() ?? ""} ${member.last_name?.trim() ?? ""}`.trim();
        }
        return this.memberRepo.save(member);
    }

    async deleteMember(id: string): Promise<void> {
        await this.memberRepo.delete(id);
    }
}
