// src/routes/goalsRouter.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireGroupMember } from "../middleware/guards";
import { httpError } from "../utils/httpError";
import { z } from "zod";
import { GoalType } from "../schema";

const r = Router();

/* ---------------------------------------------
   Zod helpers
----------------------------------------------*/
const UUID = z.string().uuid();
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // not used here, but handy later

// Body for creating a goal under a membership
const CreateGoalBody = z.object({
  name: z.string().min(2).max(64),
  type: GoalType, // "binary" | "count"
  unit: z.string().min(1).max(32).optional(),          // required only for "count"
  per_day_target: z.number().positive().optional(),     // required only for "count"
});

// Body for partial goal update (type is immutable)
const PatchGoalBody = z.object({
  name: z.string().min(2).max(64).optional(),
  unit: z.string().min(1).max(32).nullable().optional(),          // allow null to clear (for future flexibility)
  per_day_target: z.number().positive().nullable().optional(),
});

const MembershipIdParams = z.object({ membershipId: UUID });
const GroupIdParams = z.object({ groupId: UUID });
const GoalIdParams = z.object({ goalId: UUID });

/* ---------------------------------------------
   Utils
----------------------------------------------*/
// Trim + collapse whitespace in names
function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/* =====================================================================================
   POST /memberships/:membershipId/goals
   - Create a goal for *your own* membership
   - Rules:
     - Only the owner of the membership can create
     - type = "binary": unit/per_day_target must NOT be provided
     - type = "count" : unit and per_day_target are REQUIRED
===================================================================================== */
r.post(
  "/memberships/:membershipId/goals",
  requireAuth,
  async (req, res, next) => {
    try {
      const { membershipId } = MembershipIdParams.parse(req.params);
      const body = CreateGoalBody.parse(req.body);

      // Load membership and ensure caller owns it (and it's active)
      const membership = await prisma.groupMembership.findUnique({
        where: { id: membershipId },
        select: { id: true, userId: true, status: true },
      });
      if (!membership) throw httpError(404, "Membership not found");
      if (membership.userId !== req.user!.id) {
        throw httpError(403, "You can only create goals for your own membership");
      }
      if (membership.status !== "active") {
        throw httpError(400, "Cannot create a goal on an inactive membership");
      }

      // Type-specific validation
      if (body.type === "binary") {
        if (body.unit !== undefined || body.per_day_target !== undefined) {
          throw httpError(400, "Binary goals cannot have unit or per_day_target");
        }
      } else {
        // type === "count"
        if (!body.unit || body.per_day_target === undefined) {
          throw httpError(400, "Count goals require unit and per_day_target");
        }
      }

      const created = await prisma.goal.create({
        data: {
          membershipId,
          name: normalizeName(body.name),
          type: body.type,
          unit: body.type === "count" ? body.unit! : null,
          perDayTarget: body.type === "count" ? body.per_day_target! : null,
        },
      });

      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid request body/params", err.issues));
      return next(err);
    }
  }
);

/* =====================================================================================
   GET /memberships/:membershipId/goals
   - List goals for a specific membership
   - Visibility rule: any *member of the same group* can read
===================================================================================== */
r.get(
  "/memberships/:membershipId/goals",
  requireAuth,
  async (req, res, next) => {
    try {
      const { membershipId } = MembershipIdParams.parse(req.params);

      // Load the target membership → get its group
      const target = await prisma.groupMembership.findUnique({
        where: { id: membershipId },
        select: { id: true, groupId: true },
      });
      if (!target) throw httpError(404, "Membership not found");

      // Ensure caller is a member of the same group (active)
      const myMembership = await prisma.groupMembership.findFirst({
        where: { groupId: target.groupId, userId: req.user!.id, status: "active" },
        select: { id: true },
      });
      if (!myMembership) throw httpError(403, "Not a member of this group");

      const goals = await prisma.goal.findMany({
        where: { membershipId },
        orderBy: { createdAt: "asc" },
      });

      return res.json(goals);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
      return next(err);
    }
  }
);

/* =====================================================================================
   GET /groups/:groupId/goals?memberId=<optional>
   - List all goals in a group (optionally filter by memberId)
   - Visibility rule: *members of the group only*
===================================================================================== */
r.get(
  "/groups/:groupId/goals",
  requireAuth,
  requireGroupMember, // ensures req.user is an active member of :groupId
  async (req, res, next) => {
    try {
      const { groupId } = GroupIdParams.parse(req.params);

      const q = z
        .object({ memberId: UUID.optional() })
        .parse(req.query);

      // If memberId is provided, validate it belongs to the same group
      if (q.memberId) {
        const m = await prisma.groupMembership.findUnique({
          where: { id: q.memberId },
          select: { groupId: true },
        });
        if (!m || m.groupId !== groupId) {
          throw httpError(400, "memberId does not belong to this group");
        }
      }

      const goals = await prisma.goal.findMany({
        where: q.memberId ? { membershipId: q.memberId } : { membership: { groupId } },
        orderBy: [{ membershipId: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          unit: true,
          perDayTarget: true,
          membershipId: true,
          createdAt: true,
          updatedAt: true,
          membership: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true, // include if you want; remove if private
                },
              },
            },
          },
        },
      });

      return res.json(goals);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid params/query", err.issues));
      return next(err);
    }
  }
);

/* =====================================================================================
   PATCH /goals/:goalId
   - Edit goal (title/unit/target only). Type is immutable.
   - Rules:
     - Only the membership owner can edit
     - If goal.type = "binary": unit/per_day_target must remain null
     - If goal.type = "count" : after update, unit must be non-null and per_day_target > 0
===================================================================================== */
r.patch(
  "/goals/:goalId",
  requireAuth,
  async (req, res, next) => {
    try {
      const { goalId } = GoalIdParams.parse(req.params);
      const body = PatchGoalBody.parse(req.body);

      // Load goal + membership to check ownership and current values
      const goal = await prisma.goal.findUnique({
        where: { id: goalId },
        select: {
          id: true,
          name: true,
          type: true,
          unit: true,
          perDayTarget: true,
          membership: { select: { userId: true, status: true } },
        },
      });
      if (!goal) throw httpError(404, "Goal not found");

      if (goal.membership.userId !== req.user!.id) {
        throw httpError(403, "You can only edit your own goals");
      }
      if (goal.membership.status !== "active") {
        throw httpError(400, "Cannot edit a goal on an inactive membership");
      }

      // Compute the "would-be" values after patch for validation
      const nextName = body.name !== undefined ? normalizeName(body.name) : goal.name;
      const nextUnit =
        body.unit !== undefined ? (body.unit === null ? null : body.unit) : goal.unit;
      const nextTarget =
        body.per_day_target !== undefined
          ? (body.per_day_target === null ? null : body.per_day_target)
          : goal.perDayTarget;

      if (goal.type === "binary") {
        if (nextUnit !== null || nextTarget !== null) {
          throw httpError(400, "Binary goals cannot have unit or per_day_target");
        }
      } else {
        // goal.type === "count"
        if (!nextUnit || !nextTarget || !(Number(nextTarget) > 0)) {
          throw httpError(400, "Count goals must have unit and per_day_target > 0");
        }
      }

      const updated = await prisma.goal.update({
        where: { id: goalId },
        data: {
          name: nextName,
          unit: nextUnit,
          perDayTarget: nextTarget,
        },
      });

      return res.json(updated);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid request body/params", err.issues));
      return next(err);
    }
  }
);

export default r;
