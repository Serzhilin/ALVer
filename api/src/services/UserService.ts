import { AppDataSource } from "../database/data-source";
import { User } from "../database/entities/User";

const repo = () => AppDataSource.getRepository(User);

export async function findOrCreateByEname(ename: string): Promise<User> {
    const existing = await repo().findOne({ where: { ename } });
    if (existing) return existing;
    return repo().save(repo().create({ ename }));
}

export async function findById(id: string): Promise<User | null> {
    return repo().findOne({ where: { id } });
}

export async function updateUser(id: string, data: Partial<Pick<User, "first_name" | "last_name">>): Promise<User> {
    const user = await repo().findOneOrFail({ where: { id } });
    Object.assign(user, data);
    return repo().save(user);
}

/** Format display name: "Sara V." or fall back to ename */
export function displayName(user: User): string {
    if (user.first_name && user.last_name) {
        return `${user.first_name} ${user.last_name[0]}.`;
    }
    if (user.first_name) return user.first_name;
    return user.ename;
}

/** Fetch firstName/lastName from the user's eVault profile on login */
export async function fetchEVaultProfile(
    ename: string
): Promise<{ first_name: string; last_name: string } | null> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const platformUrl = process.env.PUBLIC_ALVER_BASE_URL;
    if (!registryUrl || !platformUrl) return null;

    try {
        const tokenRes = await fetch(`${registryUrl}/platforms/certification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform: platformUrl }),
        });
        if (!tokenRes.ok) return null;
        const { token } = await tokenRes.json() as { token: string };

        const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(ename)}`);
        if (!resolveRes.ok) return null;
        const { uri } = await resolveRes.json() as { uri: string };

        const USER_SCHEMA_ID = "550e8400-e29b-41d4-a716-446655440000";
        const gqlRes = await fetch(new URL("/graphql", uri).toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-ENAME": ename,
            },
            body: JSON.stringify({
                query: `query { findMetaEnvelopesByOntology(ontology: "${USER_SCHEMA_ID}") { id parsed } }`,
            }),
        });
        if (!gqlRes.ok) return null;
        const gqlData = await gqlRes.json() as any;
        const envelopes: any[] = gqlData?.data?.findMetaEnvelopesByOntology ?? [];
        if (envelopes.length === 0) return null;

        // Merge all envelopes oldest→newest — later writes win per field
        const merged: Record<string, any> = {};
        for (const env of envelopes) {
            for (const [k, v] of Object.entries(env.parsed ?? {})) {
                if (v !== null && v !== undefined && v !== "") merged[k] = v;
            }
        }

        const displayName: string = merged.displayName ?? merged.name ?? "";
        if (!displayName && !merged.firstName) return null;

        const parts = displayName.trim().split(/\s+/);
        return {
            first_name: merged.firstName ?? parts[0] ?? "",
            last_name: merged.lastName ?? (parts.length > 1 ? parts[parts.length - 1] : ""),
        };
    } catch {
        return null;
    }
}
