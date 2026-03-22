import { Request, Response } from "express";
import { AttendeeService } from "../services/AttendeeService";

const svc = new AttendeeService();

export class AttendeeController {
    /** Pre-register (before meeting) */
    preRegister = async (req: Request, res: Response) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: "name is required" });
            const attendee = await svc.preRegister(req.params.id, name);
            res.status(201).json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** Check in via app (participant self-service) */
    checkIn = async (req: Request, res: Response) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: "name is required" });
            const attendee = await svc.checkIn(req.params.id, name, "app");
            res.json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** Facilitator manual add (no app) */
    manualAdd = async (req: Request, res: Response) => {
        try {
            const { name, note } = req.body;
            if (!name) return res.status(400).json({ error: "name is required" });
            const attendee = await svc.checkIn(req.params.id, name, "manual", note);
            res.status(201).json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    list = async (req: Request, res: Response) => {
        try {
            const attendees = await svc.listForMeeting(req.params.id);
            res.json(attendees);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const attendee = await svc.update(req.params.attendeeId, req.body);
            res.json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
