import { Request, Response } from "express";
import { MeetingService } from "../services/MeetingService";
import { CommunityService } from "../services/CommunityService";
import { sseService } from "../services/SSEService";

const svc = new MeetingService();
const commSvc = new CommunityService();

export class MeetingController {
    create = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = req.body.community_id ?? (typeof req.query.communityId === 'string' ? req.query.communityId : null);
            const community = communityId
                ? await commSvc.findById(communityId)
                : await commSvc.findAsFacilitator(ename);
            if (!community) return res.status(403).json({ error: "Forbidden" });
            const meeting = await svc.create({ ...req.body, community_id: community.id });
            res.status(201).json(meeting);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    getAll = async (req: Request, res: Response) => {
        try {
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : undefined;
            const meetings = await svc.findAll(communityId);
            res.json(meetings);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    getById = async (req: Request, res: Response) => {
        try {
            const meeting = await svc.findById(req.params.id);
            if (!meeting) return res.status(404).json({ error: "Meeting not found" });
            res.json(meeting);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const meeting = await svc.update(req.params.id, req.body);
            res.json(meeting);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            await svc.delete(req.params.id);
            res.status(204).end();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    transitionStatus = async (req: Request, res: Response) => {
        try {
            const { status } = req.body;
            const meeting = await svc.transitionStatus(req.params.id, status);
            res.json(meeting);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    reopen = async (req: Request, res: Response) => {
        try {
            const meeting = await svc.reopen(req.params.id);
            res.json(meeting);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** GET /api/meetings/:id/members — public; returns regular (non-aspirant) members for mandate dropdown */
    getMembers = async (req: Request, res: Response) => {
        try {
            const meeting = await svc.findById(req.params.id);
            if (!meeting) return res.status(404).json({ error: "Meeting not found" });
            const members = await commSvc.getMembers(meeting.community_id);
            const regular = members.filter(m => !m.is_aspirant).map(m => ({ id: m.id, name: m.name }));
            res.json(regular);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    stream = (req: Request, res: Response) => {
        sseService.subscribe(req.params.id, res);
    };

    setDisplayMode = async (req: Request, res: Response) => {
        try {
            const { mode } = req.body
            const valid = ['numbers', 'bars', 'pie', 'bubbles']
            if (!valid.includes(mode)) {
                return res.status(400).json({ error: 'Invalid mode. Must be one of: numbers, bars, pie, bubbles' })
            }
            svc.setDisplayMode(req.params.id, mode)
            sseService.emit(req.params.id, 'display_mode', { mode })
            res.json({ mode })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    }
}
