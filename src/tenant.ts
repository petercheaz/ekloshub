import type { NextFunction, Request, Response } from "express";
import { canWriteRole, getMembership } from "./orgs.js";
import { isPlatformAdmin } from "./users.js";

export async function attachTenant(req: Request, res: Response, next: NextFunction) {
  const username = req.session.user!.username;
  req.platformAdmin = await isPlatformAdmin(username);
  const header = typeof req.get("x-tenant-id") === "string" ? req.get("x-tenant-id")!.trim() : "";
  if (!header) {
    req.tenantId = null;
    req.tenantRole = null;
    next();
    return;
  }

  const membership = await getMembership(header, username);
  if (!membership && !req.platformAdmin) {
    res.status(403).json({ error: "Not a member of this organization" });
    return;
  }

  req.tenantId = header;
  req.tenantRole = membership?.role ?? null;
  next();
}

export function requireWrite(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    next();
    return;
  }
  if (req.platformAdmin || canWriteRole(req.tenantRole)) {
    next();
    return;
  }
  res.status(403).json({ error: "Write access required" });
}
