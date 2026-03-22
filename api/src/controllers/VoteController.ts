import { Request, Response } from "express";
import { VoteService } from "../services/VoteService";

const svc = new VoteService();

export class VoteController {
    cast = async (req: Request, res: Response) => {
        try {
            const { voter_name, option_id, on_behalf_of_name } = req.body;
            if (!voter_name || !option_id) {
                return res.status(400).json({ error: "voter_name and option_id are required" });
            }
            const vote = await svc.cast(req.params.pollId, {
                voter_name,
                option_id,
                method: on_behalf_of_name ? "mandate" : "app",
                on_behalf_of_name,
            });
            res.status(201).json(vote);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    manualVote = async (req: Request, res: Response) => {
        try {
            const { voter_name, option_id, on_behalf_of_name } = req.body;
            if (!option_id) return res.status(400).json({ error: "option_id is required" });
            const vote = await svc.cast(req.params.pollId, {
                voter_name: voter_name ?? "Facilitator",
                option_id,
                method: "manual",
                on_behalf_of_name,
            });
            res.status(201).json(vote);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    count = async (req: Request, res: Response) => {
        try {
            const count = await svc.getCount(req.params.pollId);
            res.json({ count });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    results = async (req: Request, res: Response) => {
        try {
            const results = await svc.getResults(req.params.pollId);
            if (!results) return res.status(404).json({ error: "Results not available yet" });
            res.json(results);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    hasVoted = async (req: Request, res: Response) => {
        try {
            const { voter_name, on_behalf_of } = req.query as Record<string, string>;
            const voted = await svc.hasVoted(req.params.pollId, voter_name, on_behalf_of);
            res.json({ voted });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };
}
