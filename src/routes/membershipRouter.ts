// src/routes/membershipsRouter.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireGroupMember, requireGroupOwner } from "../middleware/guards";
import { httpError } from "../utils/httpError";

const r = Router();

/* ---------------------------------------------
   Zod helpers for params
----------------------------------------------*/
const UUID = z.string().uuid();
const GroupIdParams = z.object({ groupId: UUID });
const MemberTargetParams = z.object({ groupId: UUID, userId: UUID });

/* ---------------------------------------------
   GET /groups/:groupId/members
   - Auth + must be member of the group
   - Returns member rows with basic user info
----------------------------------------------*/
r.get("/groups/:groupId/members", requireAuth, requireGroupMember, async (req, res, next) => {
  try {
    const { groupId } = GroupIdParams.parse(req.params);

    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      orderBy: [{ role: "desc" }, { joinedAt: "asc" }], // owner first, then join order
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        memberTimezone: true,
        joinedAt: true,
        leftAt: true,
        user: {
          select: {
            id: true,
            email: true,         // include email for accountability/contact; remove if you prefer privacy
            displayName: true,
            timezone: true,
          },
        },
      },
    });

    return res.json(members);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   POST /groups/:groupId/join
   - Auth required
   - Only allowed for PUBLIC groups (private uses invites later)
   - Idempotent: if already active, just return existing membership
   - If previously left/removed, re-activate
----------------------------------------------*/
r.post("/groups/:groupId/join", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = GroupIdParams.parse(req.params);

    // Fetch group & visibility
    const group = await prisma.streakGroup.findUnique({
      where: { id: groupId },
      select: { id: true, visibility: true },
    });
    if (!group) throw httpError(404, "Group not found");
    if (group.visibility !== "public") {
      throw httpError(403, "Private group: join via invite");
    }

    // Look up existing membership
    const existing = await prisma.groupMembership.findFirst({
      where: { groupId, userId: req.user!.id },
    });

    // Snapshot current timezone from user (in case of re-join)
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { timezone: true },
    });
    const snapshotTz = me?.timezone ?? "Asia/Kolkata";

    if (existing) {
      if (existing.status === "active") {
        return res.json(existing);
      }
      // Re-activate a previous membership
      const reactivated = await prisma.groupMembership.update({
        where: { id: existing.id },
        data: {
          status: "active",
          leftAt: null,
          memberTimezone: snapshotTz,
        },
      });
      return res.status(200).json(reactivated);
    }

    // Create fresh membership
    const created = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: req.user!.id,
        role: "member",
        status: "active",
        memberTimezone: snapshotTz,
      },
    });

    return res.status(201).json(created);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
    return next(err);
  }
});




/* ---------------------------------------------
   POST /groups/:groupId/leave
   - Auth + must be current member
   - Owner cannot leave (they must transfer ownership or delete the group)
   - Sets status=left, left_at=now()
----------------------------------------------*/
r.post("/groups/:groupId/leave", requireAuth, requireGroupMember, async (req, res, next) => {
  try {
    const { groupId } = GroupIdParams.parse(req.params);

    // Find the caller's membership
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: req.user!.id, status: "active" },
      select: { id: true, role: true },
    });
    if (!membership) return res.status(204).send(); // idempotent

    if (membership.role === "owner") {
      throw httpError(400, "Owner cannot leave. Transfer ownership or delete the group.");
    }

    await prisma.groupMembership.update({
      where: { id: membership.id },
      data: { status: "left", leftAt: new Date() },
    });

    return res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   DELETE /groups/:groupId/members/:userId
   - Owner-only action
   - Sets status=removed, left_at=now()
   - Cannot remove the owner
----------------------------------------------*/
r.delete(
  "/groups/:groupId/members/:userId",
  requireAuth,
  requireGroupOwner,
  async (req, res, next) => {
    try {
      const { groupId, userId } = MemberTargetParams.parse(req.params);

      // Get target membership
      const membership = await prisma.groupMembership.findFirst({
        where: { groupId, userId },
        select: { id: true, role: true, status: true },
      });
      if (!membership) return res.status(204).send(); // idempotent

      if (membership.role === "owner") {
        throw httpError(400, "Cannot remove the group owner");
      }

      if (membership.status !== "active") {
        return res.status(204).send();
      }

      await prisma.groupMembership.update({
        where: { id: membership.id },
        data: { status: "removed", leftAt: new Date() },
      });

      return res.status(204).send();
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
      return next(err);
    }
  }
);

export default r;
