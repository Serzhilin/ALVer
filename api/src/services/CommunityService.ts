import { In } from "typeorm";
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

    /** Returns all communities a user belongs to (as facilitator or member), deduped */
    async findAllByEname(ename: string): Promise<{ community: Community; isFacilitator: boolean }[]> {
        const results: { community: Community; isFacilitator: boolean }[] = [];
        const seen = new Set<string>();

        // Communities where user is the designated facilitator
        const facilitatorCommunities = await this.repo.find({ where: { facilitator_ename: ename } });
        for (const c of facilitatorCommunities) {
            results.push({ community: c, isFacilitator: true });
            seen.add(c.id);
        }

        // Communities where user has a member row — batch fetch to avoid N+1
        const members = await this.memberRepo.find({ where: { ename } });
        const unseenMemberIds = members.map(m => m.community_id).filter(id => !seen.has(id));
        if (unseenMemberIds.length > 0) {
            const memberCommunities = await this.repo.find({ where: { id: In(unseenMemberIds) } });
            const communityMap = new Map(memberCommunities.map(c => [c.id, c]));
            for (const m of members) {
                if (!seen.has(m.community_id)) {
                    const community = communityMap.get(m.community_id);
                    if (community) {
                        const isFacilitator = m.is_facilitator || community.facilitator_ename === ename;
                        results.push({ community, isFacilitator });
                        seen.add(m.community_id);
                    }
                }
            }
        }

        return results;
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
