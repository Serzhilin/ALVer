import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
import { Member } from "../database/entities/Member";
import { findEnvelopesByOntology, getUserMetaEnvelopeId } from "../lib/evault";
import { ONTOLOGIES } from "../lib/w3ds/ontology";

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

    /**
     * Find the community this user can facilitate.
     * Checks the original bootstrap field first, then falls back to an
     * is_facilitator member row — so assigned facilitators work even after
     * the original facilitator_ename no longer points to them.
     */
    async findAsFacilitator(ename: string): Promise<Community | null> {
        // 1. Bootstrap path: community was created with this ename
        const byField = await this.repo.findOne({
            where: { facilitator_ename: ename },
            relations: ["members"],
        });
        if (byField) return byField;

        // 2. Member-row path: granted facilitator access via the members table
        const facilitatorMember = await this.memberRepo.findOne({
            where: { ename, is_facilitator: true },
        });
        if (!facilitatorMember) return null;
        return this.repo.findOne({
            where: { id: facilitatorMember.community_id },
            relations: ["members"],
        });
    }

    /** Returns true if the ename is the bootstrap facilitator or has is_facilitator=true in that community */
    async isFacilitatorOf(ename: string, communityId: string): Promise<boolean> {
        const community = await this.repo.findOne({ where: { id: communityId }, select: ["id", "facilitator_ename"] });
        if (!community) return false;
        if (community.facilitator_ename === ename) return true;
        const member = await this.memberRepo.findOne({ where: { community_id: communityId, ename, is_facilitator: true } });
        return !!member;
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
            order: { app_last_name: "ASC" },
        });
    }

    async getMemberById(memberId: string): Promise<Member | null> {
        return this.memberRepo.findOne({ where: { id: memberId } });
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

    /** Ensures the facilitator has a member row with is_facilitator=true. Idempotent. */
    async upsertFacilitatorMember(communityId: string, ename: string, appFirst: string, appLast: string): Promise<Member> {
        let member = await this.memberRepo.findOne({ where: { community_id: communityId, ename } });
        if (!member) {
            member = this.memberRepo.create({
                community_id: communityId,
                ename,
                app_first_name: appFirst || null,
                app_last_name: appLast || null,
                is_facilitator: true,
            });
        } else {
            member.is_facilitator = true;
        }
        return this.memberRepo.save(member);
    }

    async createMember(communityId: string, data: {
        app_first_name: string;
        app_last_name: string;
        email?: string;
        phone?: string;
        ename?: string;
        is_aspirant?: boolean;
        is_facilitator?: boolean;
    }): Promise<Member> {
        const member = this.memberRepo.create({
            community_id: communityId,
            app_first_name: data.app_first_name.trim(),
            app_last_name: data.app_last_name.trim(),
            email: data.email || null,
            phone: data.phone || null,
            ename: data.ename?.trim() || null,
            is_aspirant: data.is_aspirant ?? false,
            is_facilitator: data.is_facilitator ?? false,
        });
        return this.memberRepo.save(member);
    }

    async updateMember(id: string, data: Partial<Pick<Member,
        "app_first_name" | "app_last_name" | "email" | "phone" | "ename" | "is_aspirant" | "is_facilitator"
    >>): Promise<Member> {
        const member = await this.memberRepo.findOneByOrFail({ id });
        Object.assign(member, data);
        return this.memberRepo.save(member);
    }

    async deleteMember(id: string): Promise<void> {
        const member = await this.memberRepo.findOneBy({ id });
        if (member) {
            await this.memberRepo.remove(member);
        }
    }

    /** All Member rows across all communities for this ename */
    async findMembersByEname(ename: string): Promise<Member[]> {
        return this.memberRepo.find({ where: { ename } });
    }

    /** Update eVault-sourced fields only — never touches app_first_name/app_last_name */
    async updateMemberEvaultFields(id: string, data: {
        first_name: string;
        last_name: string;
        display_name: string;
        avatar_url: string | null;
    }): Promise<void> {
        await this.memberRepo.update(id, data);
    }
}

export type W3idResolution = {
    evault_uri: string;
    w3id: string;
    envelopeId: string;
    envelope: {
        name: string;
        logo_url: string | null;
        description: string | null;
    };
};

/**
 * Resolve a W3ID and verify the caller owns or admins the community.
 * Throws Error with string message: 'w3id_not_found' | 'group_not_found' | 'not_admin'
 */
export async function resolveW3id(w3id: string, userEname: string): Promise<W3idResolution> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    if (!registryUrl) throw new Error('w3id_not_found');

    const normalizedW3id = w3id.startsWith('@') ? w3id : `@${w3id}`;

    // Resolve W3ID → eVault URI
    const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalizedW3id)}`);
    if (!resolveRes.ok) throw new Error('w3id_not_found');
    const { uri: evault_uri } = await resolveRes.json() as { uri: string };

    // Fetch Chat envelopes from community eVault
    const envelopes = await findEnvelopesByOntology(normalizedW3id, ONTOLOGIES.Community, 1);
    if (envelopes.length === 0) throw new Error('group_not_found');

    const envelope = envelopes[0];
    const payload = envelope.parsed ?? {};

    // Verify caller is owner or admin
    const normalizedUserEname = userEname.startsWith('@') ? userEname : `@${userEname}`;
    const owner = (payload.owner as string | undefined) ?? '';
    const admins: string[] = Array.isArray(payload.admins) ? payload.admins : [];

    const isOwner = owner === normalizedUserEname || owner === userEname;
    let isAdmin = false;
    if (!isOwner) {
        const userMetaId = await getUserMetaEnvelopeId(normalizedUserEname);
        isAdmin = userMetaId !== null && admins.includes(userMetaId);
    }

    if (!isOwner && !isAdmin) throw new Error('not_admin');

    return {
        evault_uri,
        w3id: normalizedW3id,
        envelopeId: envelope.id,
        envelope: {
            name: (payload.name as string | undefined) ?? normalizedW3id,
            logo_url: (payload.avatar as string | undefined) ?? null,
            description: (payload.description as string | undefined) ?? null,
        },
    };
}

/**
 * Link a W3DS community to ALVer. First linker becomes facilitator.
 * Throws Error with string message: 'w3id_already_linked' | 'slug_taken' | + resolveW3id errors
 */
export async function linkCommunity(
    input: { w3id: string; slug: string },
    userEname: string
): Promise<Community> {
    const resolution = await resolveW3id(input.w3id, userEname);

    const repo = AppDataSource.getRepository(Community);

    const existing = await repo.findOne({ where: { ename: resolution.w3id } });
    if (existing) throw new Error('w3id_already_linked');

    const slugConflict = await repo.findOne({ where: { slug: input.slug } });
    if (slugConflict) throw new Error('slug_taken');

    const community = repo.create({
        name: resolution.envelope.name,
        slug: input.slug,
        facilitator_ename: userEname.startsWith('@') ? userEname : `@${userEname}`,
        logo_url: resolution.envelope.logo_url ?? null,
        ename: resolution.w3id,
        evault_uri: resolution.evault_uri,
        locations: [],
    });

    return repo.save(community);
}
