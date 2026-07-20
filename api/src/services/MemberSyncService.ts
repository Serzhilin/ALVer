import { AppDataSource } from "../database/data-source";
import { Member } from "../database/entities/Member";

const USER_ONTOLOGY = "550e8400-e29b-41d4-a716-446655440000";

/** Sync a member's eVault User profile fields (name + avatar) into ALVer's member rows.
 *  Called from WebhookController (real-time) and AaaSService (polling fallback). */
export async function syncMemberFromEvaultProfile(
    vaultEname: string,
    data: Record<string, unknown>
): Promise<void> {
    const memberRepo = AppDataSource.getRepository(Member);
    const normalizedEname = vaultEname.startsWith("@") ? vaultEname : `@${vaultEname}`;
    const bareEname = normalizedEname.slice(1);

    const members = await memberRepo.find({
        where: [{ ename: normalizedEname }, { ename: bareEname }],
    });
    if (members.length === 0) return;

    const rawDisplayName = ((data.displayName ?? data.name ?? "") as string).trim();
    const parts = rawDisplayName.split(/\s+/);
    const firstName = (data.givenName ?? data.firstName ?? parts[0] ?? "") as string;
    const lastName  = (data.familyName ?? data.lastName ??
        (parts.length > 1 ? parts[parts.length - 1] : "")) as string;
    const avatarUrl = (data.avatarUrl ?? data.avatar ?? data.picture ?? null) as string | null;

    for (const member of members) {
        if (rawDisplayName) member.display_name = rawDisplayName;
        member.first_name = firstName || member.first_name;
        member.last_name  = lastName  || member.last_name;
        member.avatar_url = avatarUrl ?? member.avatar_url;
        await memberRepo.save(member);
    }
}

export { USER_ONTOLOGY };
