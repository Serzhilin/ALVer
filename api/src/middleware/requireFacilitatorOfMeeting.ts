import { Request, Response, NextFunction } from "express";
import { CommunityService } from "../services/CommunityService";
import { MeetingService } from "../services/MeetingService";

const commSvc = new CommunityService();
const meetingSvc = new MeetingService();

/**
 * Middleware for meeting-scoped write routes.
 * Verifies that the authenticated user is the facilitator of the community
 * that owns the meeting in req.params.id.
 * Must be used after requireAuth.
 */
export async function requireFacilitatorOfMeeting(req: Request, res: Response, next: NextFunction) {
    try {
        const ename = req.user!.ename;
        const meeting = await meetingSvc.findById(req.params.id);
        if (!meeting) {
            res.status(404).json({ error: "Meeting not found" });
            return;
        }
        // Check facilitator access against the meeting's own community
        const isFacilitator = await commSvc.isFacilitatorOf(ename, meeting.community_id);
        if (!isFacilitator) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        next();
    } catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
