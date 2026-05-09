import "reflect-metadata";
import path from "path";
import { config } from "dotenv";
import { createGroupEVault } from "web3-adapter";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
// subscriber.ts loads dotenv and constructs the adapter at CJS module-evaluation
// time, so env vars are available when the adapter is constructed (no race).
import { adapter } from "../web3adapter/subscriber";

// Use override: true so ALVer's .env takes precedence over any .env loaded
// transitively by dependencies (e.g. web3-adapter loads prototype/.env via its
// own dotenv instance which would otherwise overwrite PUBLIC_REGISTRY_URL /
// PUBLIC_PROVISIONER_URL with localhost values).
config({ path: path.resolve(__dirname, "../../../.env"), override: true });

async function provisionCommunities() {
    console.log("Provisioning community eVaults...");

    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }

    // Ensure adapter's JSON mapping files are loaded before we call handleChange
    await adapter.readPaths();

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const provisionerUrl = process.env.PUBLIC_PROVISIONER_URL;

    if (!registryUrl || !provisionerUrl) {
        throw new Error("PUBLIC_REGISTRY_URL and PUBLIC_PROVISIONER_URL must be set in .env");
    }

    const repo = AppDataSource.getRepository(Community);
    const communities = await repo.find();
    const unprovisionedCount = communities.filter(c => !c.ename).length;

    console.log(`Found ${communities.length} communities, ${unprovisionedCount} need provisioning.`);

    for (const community of communities) {
        if (community.ename) {
            console.log(`  [skip] ${community.name} — already has ename: ${community.ename}`);
            continue;
        }

        console.log(`  [provision] ${community.name}...`);
        try {
            const result = await createGroupEVault(registryUrl, provisionerUrl, {
                name: community.name,
                description: `${community.name} — cooperative meeting community`,
                members: [],
                admins: [],
                owner: community.facilitator_ename ?? "",
            });

            community.ename = result.w3id;
            community.evault_uri = result.uri;
            await repo.save(community);

            // Register the manifest ID so future handleChange calls update rather
            // than create a second envelope.
            await adapter.mappingDb.storeMapping({
                localId: community.id,
                globalId: result.manifestId,
            });

            // Backfill existing members with eNames into the GroupManifest.
            const withMembers = await repo.findOne({
                where: { id: community.id },
                relations: ["members"],
            });
            if (withMembers) {
                // Keep this enrichment in sync with enrichEntity("communities") in subscriber.ts.
                const enriched: Record<string, any> = {
                    id: withMembers.id,
                    name: withMembers.name,
                    slug: withMembers.slug ?? null,
                    ename: withMembers.ename,
                    facilitator_ename: withMembers.facilitator_ename ?? null,
                    logo_url: withMembers.logo_url ?? null,
                    created_at: withMembers.created_at instanceof Date
                        ? withMembers.created_at.toISOString()
                        : withMembers.created_at,
                    updated_at: withMembers.updated_at instanceof Date
                        ? withMembers.updated_at.toISOString()
                        : withMembers.updated_at,
                    admins: withMembers.facilitator_ename ? [withMembers.facilitator_ename] : [],
                    members: (withMembers.members ?? [])
                        .filter((m) => m.ename)
                        .map((m) => m.ename),
                };
                await adapter.handleChange({ data: enriched, tableName: "communities" });
                const synced = enriched.members.length;
                console.log(`  [synced] ${synced} member(s) with eName to GroupManifest`);
            }

            console.log(`  [ok] ${community.name} → ${result.w3id}`);
        } catch (err) {
            console.error(`  [error] ${community.name}:`, err);
        }
    }

    await AppDataSource.destroy();
    console.log("Done.");
}

provisionCommunities().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
