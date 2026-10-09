import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { findUser, isPlatformAdmin, isVerified, passwordHashFor } from "./users.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

export async function login(req: Request, res: Response) {
  const body = req.body as { username?: unknown; password?: unknown };
  const submittedUser = typeof body.username === "string" ? body.username.trim() : "";
  const submittedPassword = typeof body.password === "string" ? body.password : "";
  const hash = await passwordHashFor(submittedUser);
  const passwordOk = hash ? await bcrypt.compare(submittedPassword, hash) : false;

  const username = await findUser(submittedUser);
  if (!hash || !passwordOk || !username) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  req.session.user = { username };
  res.json({
    username,
    verified: await isVerified(username),
    platformAdmin: await isPlatformAdmin(username),
  });
}

export function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Could not sign out" });
      return;
    }
    res.clearCookie("vbs.sid");
    res.json({ ok: true });
  });
}

export async function me(req: Request, res: Response) {
  const sessionUser = req.session.user;
  res.json({
    user: sessionUser
      ? {
          username: sessionUser.username,
          verified: await isVerified(sessionUser.username),
          platformAdmin: await isPlatformAdmin(sessionUser.username),
        }
      : null,
  });
}
