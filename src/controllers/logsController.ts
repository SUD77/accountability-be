// import { Request, Response } from "express";
// import { prisma } from "../lib/prisma";

// export async function upsertLogEntry(req: Request, res: Response) {
//   try {
//     const { goalId, localDate, value, done, note } = req.body as {
//       goalId?: string; localDate?: string; value?: number | string | null; done?: boolean | null; note?: string | null;
//     };
//     if (!goalId || !localDate) {
//       return res.status(400).json({ error: "goalId and localDate are required (YYYY-MM-DD)" });
//     }

//     const safeNote = typeof note === "string" ? note.slice(0, 280) : note ?? null;
//     const date = new Date(localDate);

//     const entry = await prisma.logEntry.upsert({
//       where: { goalId_localDate: { goalId, localDate: date } },
//       create: { goalId, localDate: date, value: value as any, done: done ?? null, note: safeNote },
//       update: { value: value as any, done: done ?? null, note: safeNote, editedAt: new Date() },
//     });

//     res.json(entry);
//   } catch (e: any) {
//     res.status(500).json({ error: e.message });
//   }
// }

// export async function listLogEntries(req: Request, res: Response) {
//   const goalId = req.query.goalId ? String(req.query.goalId) : undefined;
//   const from = req.query.from ? new Date(String(req.query.from)) : undefined;
//   const to = req.query.to ? new Date(String(req.query.to)) : undefined;

//   const where: any = {};
//   if (goalId) where.goalId = goalId;
//   if (from || to) where.localDate = { gte: from, lte: to };

//   const entries = await prisma.logEntry.findMany({
//     where: Object.keys(where).length ? where : undefined,
//     orderBy: [{ localDate: "asc" }, { createdAt: "asc" }],
//   });
//   res.json(entries);
// }
