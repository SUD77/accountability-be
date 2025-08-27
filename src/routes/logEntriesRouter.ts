import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { httpError } from "../utils/httpError";
import { assertLocalDateInGroupWindow } from "../utils/dates";

const r = Router();

/* ---------------------------------------------
   Zod helpers
----------------------------------------------*/
const UUID = z.string().uuid();
const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD (local date)");

const UpsertLogBody = z.object({
  goalId: UUID,
  local_date: DateStr,                    // member's local calendar date
  value: z.number().nonnegative().optional(), // for count goals
  done: z.boolean().optional(),           // for binary goals
  note: z.string().max(280).optional(),
});

const GoalIdParams = z.object({ goalId: UUID });

/* ---------------------------------------------
   Utility: normalize name (not needed here, kept for parity)
----------------------------------------------*/
// function normalize(s: string) { return s.trim().replace(/\s+/g, " "); }

/* =====================================================================================
   POST /log-entries  (UPSERT by {goalId, localDate})
   - Only the goal owner can upsert
   - Enforces type-specific fields
   - Ensures local_date is within the group's date window
===================================================================================== */
r.post("/log-entries", requireAuth, async (req, res, next) => {
  try {
    const body = UpsertLogBody.parse(req.body);

    // Load goal + membership + group to check ownership and window
    const goal = await prisma.goal.findUnique({
      where: { id: body.goalId },
      select: {
        id: true,
        type: true,
        membership: {
          select: {
            id: true,
            userId: true,
            status: true,
            memberTimezone: true,
            group: {
              select: { startDate: true, endDate: true },
            },
          },
        },
      },
    });
    if (!goal) throw httpError(404, "Goal not found");

    // Ownership & active membership checks
    if (goal.membership.userId !== req.user!.id) {
      throw httpError(403, "You can only log entries for your own goals");
    }
    if (goal.membership.status !== "active") {
      throw httpError(400, "Cannot log to a goal on an inactive membership");
    }

    // Enforce group window using the member's local date string (YYYY-MM-DD)
    assertLocalDateInGroupWindow({
      localDate: body.local_date,
      groupStartDate: goal.membership.group.startDate,
      groupEndDate: goal.membership.group.endDate,
    });

    // Type-specific validation
    if (goal.type === "binary") {
      if (body.done === undefined) {
        throw httpError(400, "Binary goals require 'done' boolean");
      }
      if (body.value !== undefined) {
        throw httpError(400, "Binary goals must not include 'value'");
      }
    } else {
      // type === 'count'
      if (body.value === undefined) {
        throw httpError(400, "Count goals require 'value' (>= 0)");
      }
      if (body.done !== undefined) {
        throw httpError(400, "Count goals must not include 'done'");
      }
    }

    // Convert YYYY-MM-DD to Date (Postgres DATE)
    const localDate = new Date(body.local_date);

    // Upsert by unique (goalId, localDate)
    const saved = await prisma.logEntry.upsert({
      where: {
        goalId_localDate: { goalId: body.goalId, localDate },
      },
      create: {
        goalId: body.goalId,
        localDate,
        value: goal.type === "count" ? body.value! : null,
        done: goal.type === "binary" ? body.done! : null,
        note: body.note ?? null,
      },
      update: {
        value: goal.type === "count" ? body.value! : null,
        done: goal.type === "binary" ? body.done! : null,
        note: body.note ?? null,
      },
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

    // Return 200 for upsert (consistent)
    return res.json(saved);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid request body", err.issues));
    return next(err);
  }
});

/* =====================================================================================
   GET /goals/:goalId/log-entries?from&to
   - Any active member of the same group can read
   - 'from' and 'to' are YYYY-MM-DD local-date strings (optional)
===================================================================================== */
r.get("/goals/:goalId/log-entries", requireAuth, async (req, res, next) => {
  try {
    const { goalId } = GoalIdParams.parse(req.params);

    // Load goal → membership → group (to verify group membership)
    const meta = await prisma.goal.findUnique({
      where: { id: goalId },
      select: {
        id: true,
        membership: {
          select: {
            groupId: true,
          },
        },
      },
    });
    if (!meta) throw httpError(404, "Goal not found");

    // Ensure requester is a member of the same group (active)
    const myMembership = await prisma.groupMembership.findFirst({
      where: { userId: req.user!.id, groupId: meta.membership.groupId, status: "active" },
      select: { id: true },
    });
    if (!myMembership) throw httpError(403, "Not a member of this group");

    // Parse optional range
    const q = z
      .object({
        from: DateStr.optional(),
        to: DateStr.optional(),
      })
      .parse(req.query);

    let whereClause: any = { goalId };
    if (q.from || q.to) {
      const gte = q.from ? new Date(q.from) : undefined;
      const lte = q.to ? new Date(q.to) : undefined;
      if (gte && lte && lte < gte) {
        throw httpError(400, "'to' must be greater than or equal to 'from'");
      }
      whereClause.localDate = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    }

    const rows = await prisma.logEntry.findMany({
      where: whereClause,
      orderBy: { localDate: "asc" },
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

    return res.json(rows);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid params/query", err.issues));
    return next(err);
  }
});

export default r;
