import { Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";

const repo = () => AppDataSource.getRepository(Community);

/** GET /api/admin/communities */
export async function listCommunities(_req: Request, res: Response) {
    const communities = await repo().find({ order: { created_at: "ASC" } });
    res.json(communities);
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
