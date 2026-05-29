import { Request, Response } from "express";
import { MandateService } from "../services/MandateService";
import { sseService } from "../services/SSEService";

const svc = new MandateService();

export class MandateController {
    create = async (req: Request, res: Response) => {
        try {
            const granter_ename = req.user?.ename;
            if (!granter_ename) return res.status(401).json({ error: "Authentication required" });
            const { proxy_member_id, scope_note, granter_member_id } = req.body;
            if (!proxy_member_id) {
                return res.status(400).json({ error: "proxy_member_id is required" });
            }
            const mandate = await svc.create(req.params.id, { granter_ename, proxy_member_id, scope_note, granter_member_id });
            sseService.emit(req.params.id, "mandate_updated", { meetingId: req.params.id });
            res.status(201).json(mandate);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    list = async (req: Request, res: Response) => {
        try {
            const mandates = await svc.listForMeeting(req.params.id);
            res.json(mandates);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    revoke = async (req: Request, res: Response) => {
        try {
            await svc.revoke(req.params.mandateId);
            sseService.emit(req.params.id, "mandate_updated", { meetingId: req.params.id });
            res.status(204).end();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
