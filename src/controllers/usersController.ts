import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function createUser(req: Request, res: Response) {
  try {
    const { email, timezone } = req.body as { email?: string; timezone?: string };
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await prisma.user.create({
      data: { email, timezone: timezone || "Asia/Kolkata" },
    });
    res.json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  res.json(users);
}
