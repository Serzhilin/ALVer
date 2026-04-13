import { Request, Response } from "express";
import { PollService } from "../services/PollService";
import { v4 as uuidv4 } from "uuid";

const svc = new PollService();

export class PollController {
    create = async (req: Request, res: Response) => {
        try {
            const { motion_text, vote_options } = req.body;
            if (!motion_text) return res.status(400).json({ error: "motion_text is required" });

            // Accept [{label}] and auto-generate ids, or [{id, label}]
            const options = (vote_options ?? []).map((o: any) => ({
                id: o.id ?? o.label.toLowerCase().replace(/\s+/g, "_"),
                label: o.label ?? o,
            }));

            const poll = await svc.create(req.params.id, { motion_text, vote_options: options });
            res.status(201).json(poll);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    list = async (req: Request, res: Response) => {
        try {
            const polls = await svc.listForMeeting(req.params.id);
            res.json(polls);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    open = async (req: Request, res: Response) => {
        try {
            const poll = await svc.open(req.params.pollId, req.params.id);
            res.json(poll);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    close = async (req: Request, res: Response) => {
        try {
            const { poll, decision } = await svc.close(req.params.pollId, req.params.id);
            res.json({ poll, decision });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const poll = await svc.update(req.params.pollId, req.body);
            res.json(poll);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            await svc.delete(req.params.pollId);
            res.status(204).send();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    reorder = async (req: Request, res: Response) => {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
                return res.status(400).json({ error: "ids must be an array of strings" });
            }
            await svc.reorder(req.params.id, ids);
            res.status(204).send();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    decisions = async (req: Request, res: Response) => {
        try {
            const decisions = await svc.getDecisionsForMeeting(req.params.id);
            res.json(decisions);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
