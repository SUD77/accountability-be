// import { Request, Response } from "express";
// import { prisma } from "../lib/prisma";

// export async function createStreak(req: Request, res: Response) {
//   try {
//     const { userId, name, startDate, endDate } = req.body as {
//       userId?: string; name?: string; startDate?: string; endDate?: string;
//     };
//     if (!userId || !name || !startDate || !endDate) {
//       return res.status(400).json({ error: "userId, name, startDate, endDate are required" });
//     }

//     const streak = await prisma.streak.create({
//       data: {
//         userId,
//         name,
//         startDate: new Date(startDate),
//         endDate: new Date(endDate),
//       },
//     });
//     res.json(streak);
//   } catch (e: any) {
//     res.status(500).json({ error: e.message });
//   }
// }

// export async function listStreaks(req: Request, res: Response) {
//   const userId = req.query.userId ? String(req.query.userId) : undefined;
//   const streaks = await prisma.streak.findMany({
//     where: userId ? { userId } : undefined,
//     orderBy: { createdAt: "desc" },
//   });
//   res.json(streaks);
// }
