import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../database/data-source";
import { Meeting } from "../database/entities/Meeting";
import { CommunityService } from "../services/CommunityService";

const commSvc = new CommunityService();

/**
 * Allows the request only if the authenticated user is either:
 * - The notulist assigned to this meeting (notulist_ename matches)
 * - A facilitator of the meeting's community
 * Requires requireAuth to have run first (req.user must be set).
 */
export async function requireNotulisOrFacilitator(req: Request, res: Response, next: NextFunction) {
    try {
        const { ename } = req.user!;
        const meetingId = req.params.id;

        const meetingRepo = AppDataSource.getRepository(Meeting);
        const meeting = await meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) return res.status(404).json({ error: "Meeting not found" });

        if (meeting.notulist_ename === ename) return next();

        const isFacilitator = meeting.community_id
            ? await commSvc.isFacilitatorOf(ename, meeting.community_id)
            : false;
        if (isFacilitator) return next();

        return res.status(403).json({ error: "Forbidden" });
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
