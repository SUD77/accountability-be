// src/routes/groupViewsRouter.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireGroupMember } from "../middleware/guards";
import { httpError } from "../utils/httpError";

const r = Router();

/* ---------------------------------------------
   Small date helpers (UTC-based, avoids tz pitfalls)
----------------------------------------------*/
const pad = (n: number) => `${n}`.padStart(2, "0");
const toYMD = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function addDaysUTC(d: Date, days: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clampOverviewWindow(groupStart: Date, groupEnd: Date, days: number) {
  // Always return a window inside [groupStart, groupEnd] of length up to `days`.
  // If group is upcoming, use its first `days`; if completed, use its last `days`;
  // if active, end at today (UTC) and backfill.
  const today = new Date();
  const gS = new Date(Date.UTC(groupStart.getUTCFullYear(), groupStart.getUTCMonth(), groupStart.getUTCDate()));
  const gE = new Date(Date.UTC(groupEnd.getUTCFullYear(), groupEnd.getUTCMonth(), groupEnd.getUTCDate()));

  let end: Date;
  if (today < gS) {
    // upcoming → show first chunk
    end = addDaysUTC(gS, Math.min(days - 1, Math.floor((+gE - +gS) / 86_400_000)));
  } else if (today > gE) {
    // completed → show last chunk
    end = gE;
  } else {
    // active → show up to today
    end = today;
    // but never past group end
    if (end > gE) end = gE;
  }

  let start = addDaysUTC(end, -(days - 1));
  if (start < gS) start = gS;

  // Ensure start <= end
  if (start > end) start = end;

  return { start, end, startYMD: toYMD(start), endYMD: toYMD(end) };
}

/* ---------------------------------------------
   Zod parsers
----------------------------------------------*/
const UUID = z.string().uuid();

const GroupParams = z.object({ groupId: UUID });
const OverviewQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

const ActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* =====================================================================================
   GET /groups/:groupId/overview?days=7|30
   - Requires auth + membership
   - Returns: group meta, chosen window, and for each active member:
       their goals + logs within the window.
   - Window is always clamped to the group dates so it's never empty.
===================================================================================== */
r.get(
  "/groups/:groupId/overview",
  requireAuth,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const { groupId } = GroupParams.parse(req.params);
      const { days } = OverviewQuery.parse(req.query);

      // Load group + active memberships + their goals
      const group = await prisma.streakGroup.findUnique({
        where: { id: groupId },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          visibility: true,
          status: true,
          ownerId: true,
          createdAt: true,
          memberships: {
            where: { status: "active" },
            orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
            select: {
              id: true,
              userId: true,
              role: true,
              memberTimezone: true,
              user: { select: { id: true, displayName: true, email: true } },
              goals: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  unit: true,
                  perDayTarget: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
      if (!group) throw httpError(404, "Group not found");

      // Determine time window (inclusive) for logs
      const { start, end, startYMD, endYMD } = clampOverviewWindow(
        group.startDate,
        group.endDate,
        days
      );

      // Collect all goal IDs to fetch logs in a single query
      const goalIds = group.memberships.flatMap((m) => m.goals.map((g) => g.id));
      let logsByGoal = new Map<string, Array<any>>();

      if (goalIds.length > 0) {
        const logRows = await prisma.logEntry.findMany({
          where: {
            goalId: { in: goalIds },
            localDate: { gte: start, lte: end },
          },
          orderBy: [{ goalId: "asc" }, { localDate: "asc" }],
          select: {
            id: true,
            goalId: true,
            localDate: true,
            value: true,
            done: true,
            note: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        logsByGoal = logRows.reduce((acc, row) => {
          const arr = acc.get(row.goalId) ?? [];
          arr.push(row);
          acc.set(row.goalId, arr);
          return acc;
        }, new Map<string, any[]>());
      }

      // Build compact response
      const payload = {
        group: {
          id: group.id,
          name: group.name,
          start_date: toYMD(group.startDate),
          end_date: toYMD(group.endDate),
          visibility: group.visibility,
          status: group.status, // stored status
          computed_status:
            (() => {
              const t = toYMD(new Date());
              const s = toYMD(group.startDate);
              const e = toYMD(group.endDate);
              if (t < s) return "upcoming";
              if (t > e) return "completed";
              return "active";
            })(),
          owner_id: group.ownerId,
          created_at: group.createdAt,
          window: { start: startYMD, end: endYMD, days },
        },
        members: group.memberships.map((m) => ({
          membership_id: m.id,
          user: {
            id: m.user.id,
            display_name: m.user.displayName,
            email: m.user.email,
          },
          role: m.role,
          member_timezone: m.memberTimezone,
          goals: m.goals.map((g) => ({
            id: g.id,
            name: g.name,
            type: g.type,
            unit: g.unit,
            per_day_target: g.perDayTarget,
            created_at: g.createdAt,
            logs: (logsByGoal.get(g.id) ?? []).map((l) => ({
              id: l.id,
              local_date: toYMD(l.localDate),
              value: l.value,
              done: l.done,
              note: l.note,
              updated_at: l.updatedAt,
            })),
          })),
        })),
      };

      return res.json(payload);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid params/query", err.issues));
      return next(err);
    }
  }
);

/* =====================================================================================
   GET /groups/:groupId/activity?limit=50
   - Requires auth + membership
   - Returns recent log entries across the group (newest first)
     with user + goal snippets.
===================================================================================== */
r.get(
  "/groups/:groupId/activity",
  requireAuth,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const { groupId } = GroupParams.parse(req.params);
      const { limit } = ActivityQuery.parse(req.query);

      // Pull recent logs across all goals in the group
      const rows = await prisma.logEntry.findMany({
        where: { goal: { membership: { groupId } } },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
        select: {
          id: true,
          goalId: true,
          localDate: true,
          value: true,
          done: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          goal: {
            select: {
              id: true,
              name: true,
              type: true,
              membership: {
                select: {
                  id: true,
                  user: { select: { id: true, displayName: true, email: true } },
                },
              },
            },
          },
        },
      });

      const feed = rows.map((r) => ({
        id: r.id,
        when_local_date: toYMD(r.localDate),
        updated_at: r.updatedAt,
        goal: {
          id: r.goal.id,
          name: r.goal.name,
          type: r.goal.type,
        },
        member: {
          membership_id: r.goal.membership.id,
          user: {
            id: r.goal.membership.user.id,
            display_name: r.goal.membership.user.displayName,
            email: r.goal.membership.user.email,
          },
        },
        data: r.goal.type === "binary"
          ? { done: r.done, note: r.note ?? null }
          : { value: r.value, note: r.note ?? null },
      }));

      return res.json({ items: feed, limit });
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid params/query", err.issues));
      return next(err);
    }
  }
);

export default r;
