import { Request, Response } from "express";
import { CommunityService } from "../services/CommunityService";
import { Community } from "../database/entities/Community";

const svc = new CommunityService();

export class CommunityController {
    /** GET /api/community/branding — public; returns logo, colour, font for unauthenticated views */
    getBranding = async (_req: Request, res: Response) => {
        try {
            const branding = await svc.getFirstBranding();
            if (!branding) return res.status(404).json({ error: "No community configured" });
            res.json(branding);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    /** GET /api/community — returns the selected community (by ?communityId) or first match */
    get = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            let community = null;
            if (communityId) {
                community = await svc.findById(communityId);
            } else {
                community =
                    (await svc.findByFacilitatorEname(ename)) ??
                    (await svc.findByMemberEname(ename));
            }
            if (!community) return res.status(404).json({ error: "No community found" });
            res.json(community);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    /** PATCH /api/community — update name, logo_url, locations */
    update = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            const community = communityId
                ? await svc.findById(communityId)
                : await svc.findAsFacilitator(ename);
            if (!community) return res.status(404).json({ error: "Community not found" });
            if (communityId && !await svc.isFacilitatorOf(ename, community.id)) {
                return res.status(403).json({ error: "Forbidden" });
            }
            const { name, logo_url, locations, primary_color, title_font } = req.body;
            const data: Partial<Pick<Community, "name" | "logo_url" | "locations" | "primary_color" | "title_font">> = {};
            if (name !== undefined) data.name = name;
            if (logo_url !== undefined) data.logo_url = logo_url;
            if (locations !== undefined) data.locations = locations;
            if (primary_color !== undefined) data.primary_color = primary_color;
            if (title_font !== undefined) data.title_font = title_font;
            const updated = await svc.update(community.id, data);
            res.json(updated);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** GET /api/community/members */
    listMembers = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            const community = communityId
                ? await svc.findById(communityId)
                : await svc.findAsFacilitator(ename);
            if (!community) return res.status(404).json({ error: "Community not found" });
            const members = await svc.getMembers(community.id);
            res.json(members);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    /** POST /api/community/members */
    createMember = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            const community = communityId
                ? await svc.findById(communityId)
                : await svc.findAsFacilitator(ename);
            if (!community) return res.status(404).json({ error: "Community not found" });
            if (communityId && !await svc.isFacilitatorOf(ename, community.id)) {
                return res.status(403).json({ error: "Forbidden" });
            }
            const member = await svc.createMember(community.id, req.body);
            res.status(201).json(member);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** PATCH /api/community/members/:memberId */
    updateMember = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            const community = communityId
                ? await svc.findById(communityId)
                : await svc.findAsFacilitator(ename);
            if (!community) return res.status(403).json({ error: "Forbidden" });
            if (communityId && !await svc.isFacilitatorOf(ename, community.id)) {
                return res.status(403).json({ error: "Forbidden" });
            }

            const existing = await svc.getMemberById(req.params.memberId);
            if (!existing || existing.community_id !== community.id) {
                return res.status(404).json({ error: "Member not found" });
            }

            const body = { ...req.body };
            // Prevent admin from removing their own facilitator access
            if (existing.ename && existing.ename === ename) {
                delete body.is_facilitator;
            }

            const member = await svc.updateMember(req.params.memberId, body);
            res.json(member);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** DELETE /api/community/members/:memberId */
    deleteMember = async (req: Request, res: Response) => {
        try {
            const ename = req.user!.ename;
            const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
            const community = communityId
                ? await svc.findById(communityId)
                : await svc.findAsFacilitator(ename);
            if (!community) return res.status(403).json({ error: "Forbidden" });
            if (communityId && !await svc.isFacilitatorOf(ename, community.id)) {
                return res.status(403).json({ error: "Forbidden" });
            }

            const existing = await svc.getMemberById(req.params.memberId);
            if (!existing || existing.community_id !== community.id) {
                return res.status(404).json({ error: "Member not found" });
            }

            await svc.deleteMember(req.params.memberId);
            res.status(204).end();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
