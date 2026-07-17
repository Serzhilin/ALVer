const USER_SCHEMA_ID = "550e8400-e29b-41d4-a716-446655440000";

/** Fetch firstName/lastName/avatarUrl from the user's eVault profile on login.
 *  Uses static DEVELOPER_API_KEY — the old /platforms/certification per-request token flow
 *  was removed from the W3DS protocol. */
export async function fetchEVaultProfile(
    ename: string
): Promise<{ first_name: string; last_name: string; display_name: string; avatar_url?: string } | null> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const developerApiKey = process.env.DEVELOPER_API_KEY ?? "";
    if (!registryUrl) return null;

    try {
        const normalizedEname = ename.startsWith("@") ? ename : `@${ename}`;

        const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalizedEname)}`);
        if (!resolveRes.ok) return null;
        const { uri } = await resolveRes.json() as { uri: string };

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-ENAME": normalizedEname,
        };
        if (developerApiKey) headers["Authorization"] = `Bearer ${developerApiKey}`;

        const gqlRes = await fetch(new URL("/graphql", uri).toString(), {
            method: "POST",
            headers,
            body: JSON.stringify({
                query: `query {
                    metaEnvelopes(filter: { ontologyId: "${USER_SCHEMA_ID}" }, first: 1) {
                        edges { node { id parsed } }
                    }
                }`,
            }),
        });
        if (!gqlRes.ok) return null;
        const gqlData = await gqlRes.json() as any;
        const nodes: any[] = gqlData?.data?.metaEnvelopes?.edges?.map((e: any) => e.node) ?? [];
        if (nodes.length === 0) return null;

        const data: Record<string, any> = nodes[0].parsed ?? {};
        const displayNameStr = ((data.displayName ?? data.name ?? "") as string).trim();
        const parts = displayNameStr.split(/\s+/);
        const firstName = (data.firstName ?? data.givenName ?? parts[0] ?? "") as string;
        const lastName = (data.lastName ?? data.familyName ?? (parts.length > 1 ? parts.slice(1).join(" ") : "")) as string;
        if (!firstName) return null;

        const avatarUrl: string | undefined = data.avatarUrl ?? data.avatar ?? data.picture ?? undefined;
        const rawDisplayName = (data.displayName ?? data.name ?? `${firstName} ${lastName}`).toString().trim();
        return { first_name: firstName, last_name: lastName, display_name: rawDisplayName, avatar_url: avatarUrl };
    } catch {
        return null;
    }
}

const GQL_FIND_BY_ONTOLOGY = `
  query FindByOntology($ontologyId: ID!, $first: Int, $after: String) {
    metaEnvelopes(filter: { ontologyId: $ontologyId }, first: $first, after: $after) {
      edges { node { id ontology parsed } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** Fetch all MetaEnvelopes of a given ontology from a vault. Paginates automatically. */
export async function findEnvelopesByOntology(
    vaultEname: string,
    ontology: string,
    limit = 100
): Promise<Array<{ id: string; parsed: Record<string, unknown> | null }>> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const developerApiKey = process.env.DEVELOPER_API_KEY ?? "";
    if (!registryUrl) return [];

    const normalizedEname = vaultEname.startsWith("@") ? vaultEname : `@${vaultEname}`;
    try {
        const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalizedEname)}`);
        if (!resolveRes.ok) return [];
        const { uri } = await resolveRes.json() as { uri: string };
        const endpoint = new URL("/graphql", uri).toString();

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-ENAME": normalizedEname,
        };
        if (developerApiKey) headers["Authorization"] = `Bearer ${developerApiKey}`;

        const results: Array<{ id: string; parsed: Record<string, unknown> | null }> = [];
        let after: string | null = null;

        for (let page = 0; page < 20; page++) {
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    query: GQL_FIND_BY_ONTOLOGY,
                    variables: { ontologyId: ontology, first: limit, after },
                }),
            });
            if (!res.ok) break;
            const body = await res.json() as any;
            const edges: any[] = body?.data?.metaEnvelopes?.edges ?? [];
            for (const edge of edges) {
                results.push({ id: edge.node.id, parsed: edge.node.parsed ?? null });
            }
            const pageInfo = body?.data?.metaEnvelopes?.pageInfo;
            if (!pageInfo?.hasNextPage) break;
            after = pageInfo.endCursor;
        }
        return results;
    } catch {
        return [];
    }
}

/** Resolve eName → MetaEnvelope ID of the User profile envelope. */
export async function getUserMetaEnvelopeId(ename: string): Promise<string | null> {
    const { ONTOLOGIES } = await import("./w3ds/ontology");
    try {
        const envelopes = await findEnvelopesByOntology(ename, ONTOLOGIES.User, 1);
        return envelopes[0]?.id ?? null;
    } catch {
        return null;
    }
}
