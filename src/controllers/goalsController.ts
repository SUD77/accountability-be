import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const ALLOWED_TYPES = new Set(["binary", "count"]);

export async function createGoal(req: Request, res: Response) {
  try {
    const { streakId, name, type, unit, perDayTarget } = req.body as {
      streakId?: string; name?: string; type?: string; unit?: string | null; perDayTarget?: number | string | null;
    };

    if (!streakId || !name || !type) {
      return res.status(400).json({ error: "streakId, name, type are required" });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: "type must be 'binary' or 'count'" });
    }

    const goal = await prisma.goal.create({
      data: {
        streakId,
        name,
        type,
        unit: unit ?? null,
        perDayTarget: perDayTarget as any, // Prisma accepts number/string/Decimal
      },
    });
    res.json(goal);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function listGoals(req: Request, res: Response) {
  const streakId = req.query.streakId ? String(req.query.streakId) : undefined;
  const goals = await prisma.goal.findMany({
    where: streakId ? { streakId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json(goals);
}
