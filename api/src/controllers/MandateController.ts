import { Request, Response } from "express";
import { MandateService } from "../services/MandateService";
import { sseService } from "../services/SSEService";

const svc = new MandateService();

export class MandateController {
    create = async (req: Request, res: Response) => {
        try {
            const { granter_name, proxy_name, scope_note } = req.body;
            if (!granter_name || !proxy_name) {
                return res.status(400).json({ error: "granter_name and proxy_name are required" });
            }
            const mandate = await svc.create(req.params.id, { granter_name, proxy_name, scope_note });
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
            const mandate = await svc.revoke(req.params.mandateId);
            sseService.emit(req.params.id, "mandate_updated", { meetingId: req.params.id });
            res.json(mandate);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
