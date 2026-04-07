import { Request, Response } from "express";
import { createGroupEVault } from "web3-adapter";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";

const repo = () => AppDataSource.getRepository(Community);

/** GET /api/admin/communities */
export async function listCommunities(_req: Request, res: Response) {
    const communities = await repo().find({ order: { created_at: "ASC" } });
    res.json(communities);
}

/** POST /api/admin/communities */
export async function createCommunity(req: Request, res: Response) {
    const { name, slug, facilitator_ename, primary_color, title_font, logo_url } = req.body;
    if (!name || !slug || !facilitator_ename) {
        res.status(400).json({ error: "name, slug and facilitator_ename are required" });
        return;
    }

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const provisionerUrl = process.env.PUBLIC_PROVISIONER_URL;
    if (!registryUrl || !provisionerUrl) {
        res.status(500).json({ error: "PUBLIC_REGISTRY_URL and PUBLIC_PROVISIONER_URL must be configured" });
        return;
    }

    const existing = await repo().findOne({ where: { slug } });
    if (existing) {
        res.status(409).json({ error: "Slug already taken" });
        return;
    }

    let evaultResult: { w3id: string; uri: string; manifestId: string };
    try {
        evaultResult = await createGroupEVault(registryUrl, provisionerUrl, {
            name,
            description: `${name} — cooperative meeting community`,
            members: [],
            admins: [],
            owner: facilitator_ename,
        });
    } catch (err: any) {
        console.error("[Admin] eVault provisioning failed:", err);
        res.status(502).json({ error: `eVault provisioning failed: ${err?.message ?? String(err)}` });
        return;
    }

    const community = repo().create({
        name,
        slug,
        facilitator_ename,
        primary_color: primary_color || "#C4622D",
        title_font: title_font || "Playfair Display",
        logo_url: logo_url || null,
        ename: evaultResult.w3id,
        evault_uri: evaultResult.uri,
        locations: [],
    });
    const saved = await repo().save(community);
    res.status(201).json(saved);
}

/** DELETE /api/admin/communities/:id */
export async function deleteCommunity(req: Request, res: Response) {
    const { id } = req.params;
    const community = await repo().findOne({ where: { id } });
    if (!community) {
        res.status(404).json({ error: "Community not found" });
        return;
    }
    await repo().delete(id);
    res.status(204).end();
}
