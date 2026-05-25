import { Request, Response } from "express";
import { AttendeeService } from "../services/AttendeeService";

const svc = new AttendeeService();

export class AttendeeController {
    /** W3DS self-check-in — requires JWT, ename used for identity */
    checkIn = async (req: Request, res: Response) => {
        try {
            const ename = req.user?.ename;
            if (!ename) return res.status(401).json({ error: "Authentication required" });
            const attendee = await svc.checkInByEname(req.params.id, ename);
            res.json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** Facilitator manual check-in — requires member_id in body */
    manualAdd = async (req: Request, res: Response) => {
        try {
            const { member_id, note } = req.body;
            if (!member_id) return res.status(400).json({ error: "member_id is required" });
            const attendee = await svc.checkInByMemberId(req.params.id, member_id, note);
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

    delete = async (req: Request, res: Response) => {
        try {
            await svc.delete(req.params.attendeeId);
            res.status(204).send();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
