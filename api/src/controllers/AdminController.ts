import { Request, Response } from "express";
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
    const { name, slug, facilitator_ename, primary_color, title_font } = req.body;
    if (!name || !slug || !facilitator_ename) {
        res.status(400).json({ error: "name, slug and facilitator_ename are required" });
        return;
    }
    const existing = await repo().findOne({ where: { slug } });
    if (existing) {
        res.status(409).json({ error: "Slug already taken" });
        return;
    }
    const community = repo().create({
        name,
        slug,
        facilitator_ename,
        primary_color: primary_color || "#C4622D",
        title_font: title_font || "Playfair Display",
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
