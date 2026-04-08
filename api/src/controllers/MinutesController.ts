import { Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Meeting } from "../database/entities/Meeting";
import { sseService } from "../services/SSEService";
import { CommunityService } from "../services/CommunityService";
import { logger } from "../lib/logger";

const commSvc = new CommunityService();

export class MinutesController {
    private repo = AppDataSource.getRepository(Meeting);

    /** PATCH /api/meetings/:id/notulist — facilitator only, assigns or clears notulist */
    assignNotulist = async (req: Request, res: Response) => {
        try {
            const { ename } = req.user!;
            const meeting = await this.repo.findOneBy({ id: req.params.id });
            if (!meeting) return res.status(404).json({ error: "Meeting not found" });

            // Only facilitator may assign
            const isFacilitator = meeting.community_id
                ? await commSvc.isFacilitatorOf(ename, meeting.community_id)
                : false;
            if (!isFacilitator) return res.status(403).json({ error: "Forbidden" });

            const notulist_ename = req.body.notulist_ename ?? null;
            await this.repo.update(meeting.id, { notulist_ename });

            logger.info({ meetingId: meeting.id, notulist_ename, assignedBy: ename }, "notulist assigned");
            sseService.emit(meeting.id, "notulist_assigned", { notulist_ename });
            res.json({ notulist_ename });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    /** PATCH /api/meetings/:id/minutes — notulist or facilitator, saves draft HTML */
    saveDraft = async (req: Request, res: Response) => {
        try {
            const meeting = await this.repo.findOneBy({ id: req.params.id });
            if (!meeting) return res.status(404).json({ error: "Meeting not found" });
            if (meeting.minutes_status === "published") {
                return res.status(403).json({ error: "Minutes are published and cannot be edited" });
            }

            const { html } = req.body;
            if (typeof html !== "string") return res.status(400).json({ error: "html is required" });

            await this.repo.update(meeting.id, {
                minutes_html: html,
                minutes_status: "draft",
            });
            res.status(204).send();
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    /** PATCH /api/meetings/:id/minutes/publish — notulist or facilitator, publishes minutes */
    publish = async (req: Request, res: Response) => {
        try {
            const meeting = await this.repo.findOneBy({ id: req.params.id });
            if (!meeting) return res.status(404).json({ error: "Meeting not found" });
            if (meeting.minutes_status === "published") {
                return res.status(409).json({ error: "Minutes are already published" });
            }
            if (!meeting.minutes_html) {
                return res.status(400).json({ error: "No minutes content to publish" });
            }

            await this.repo.update(meeting.id, { minutes_status: "published" });
            logger.info({ meetingId: meeting.id, publishedBy: req.user!.ename }, "minutes published");
            sseService.emit(meeting.id, "minutes_published", { meetingId: meeting.id });
            res.json({ minutes_status: "published" });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
