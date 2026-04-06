import { Request, Response, NextFunction } from "express";

const ADMIN_ENAME = process.env.ADMIN_ENAME || "@9dafa031-4118-564c-bfa6-5917ddc8ab88";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.user.ename !== ADMIN_ENAME) {
        res.status(403).json({ error: "Forbidden" });
        return;
    }
    next();
}
