/**
 * Smoke test: fetch a platform token from the registry, then query the ALVer
 * community eVault to verify connectivity and auth.
 *
 * Usage:
 *   npx ts-node src/scripts/smoke-test-evault.ts
 *
 * Requires: PUBLIC_REGISTRY_URL and VITE_PUBLIC_ALVER_BASE_URL in api/.env
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const REGISTRY_URL = process.env.PUBLIC_REGISTRY_URL!;
const PLATFORM_URL = process.env.VITE_PUBLIC_ALVER_BASE_URL!;
const EVAULT_W3ID = "@de68861c-8ea9-55be-9258-2a8cc3057a60"; // First ALVer community eVault

async function getPlatformToken(): Promise<string> {
    console.log(`\n[1] Requesting platform token from registry...`);
    console.log(`    POST ${REGISTRY_URL}/platforms/certification`);
    console.log(`    body: { platform: "${PLATFORM_URL}" }`);

    const res = await fetch(`${REGISTRY_URL}/platforms/certification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: PLATFORM_URL }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Registry returned ${res.status}: ${body}`);
    }

    const data = await res.json() as { token: string; expiresAt?: number };
    console.log(`    ✅ Got token (expires: ${data.expiresAt ? new Date(data.expiresAt).toISOString() : "unknown"})`);
    return data.token;
}

async function resolveEVaultUrl(w3id: string): Promise<string> {
    console.log(`\n[2] Resolving eVault URL for ${w3id}...`);
    const res = await fetch(`${REGISTRY_URL}/resolve?w3id=${w3id}`);

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Registry resolve returned ${res.status}: ${body}`);
    }

    const data = await res.json() as { uri: string };
    const graphqlUrl = `${data.uri}/graphql`;
    console.log(`    ✅ eVault URI: ${data.uri}`);
    console.log(`    ✅ GraphQL endpoint: ${graphqlUrl}`);
    return graphqlUrl;
}

async function queryEVault(graphqlUrl: string, token: string, w3id: string) {
    console.log(`\n[3] Querying eVault...`);
    console.log(`    POST ${graphqlUrl}`);
    console.log(`    Headers: Authorization: Bearer <token>, X-ENAME: ${w3id}`);

    const query = `{
  metaEnvelopes {
    totalCount
    edges {
      node {
        id
        ontology
      }
    }
  }
}`;

    const res = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "X-ENAME": w3id,
        },
        body: JSON.stringify({ query }),
    });

    const data = await res.json() as {
        errors?: { message: string; extensions?: { code: string } }[];
        data?: { metaEnvelopes: { totalCount: number; edges: { node: { id: string; ontology: string } }[] } };
    };

    if (data.errors) {
        console.error(`\n    ❌ GraphQL errors:`);
        console.error(JSON.stringify(data.errors, null, 2));
    } else if (data.data) {
        console.log(`\n    ✅ Success!`);
        console.log(`    Total envelopes: ${data.data.metaEnvelopes.totalCount}`);
        if (data.data.metaEnvelopes.edges.length > 0) {
            console.log(`    Envelopes:`);
            for (const edge of data.data.metaEnvelopes.edges) {
                console.log(`      - id: ${edge.node.id}, ontology: ${edge.node.ontology}`);
            }
        } else {
            console.log(`    (no envelopes stored yet)`);
        }
    }

    return data;
}

async function main() {
    console.log("=== ALVer eVault Smoke Test ===");
    console.log(`Registry:  ${REGISTRY_URL}`);
    console.log(`Platform:  ${PLATFORM_URL}`);
    console.log(`eVault W3ID: ${EVAULT_W3ID}`);

    try {
        const token = await getPlatformToken();
        const graphqlUrl = await resolveEVaultUrl(EVAULT_W3ID);
        await queryEVault(graphqlUrl, token, EVAULT_W3ID);
    } catch (err) {
        console.error(`\n❌ Smoke test failed:`, err);
        process.exit(1);
    }

    console.log("\n=== Done ===");
}

main();
