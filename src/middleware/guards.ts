import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { httpError } from "../utils/httpError";

/** Ensures the current user is an active member of :groupId. Attaches membership to req. */
export async function requireGroupMember(req: Request, _res: Response, next: NextFunction) {
  const userId = req.user?.id;
  const groupId = req.params.groupId;
  if (!userId) throw httpError(401, "Unauthorized");
  if (!groupId) throw httpError(400, "Missing groupId in route params");

  const membership = await prisma.groupMembership.findFirst({
    where: { userId, groupId, status: "active" },
    select: { id: true, role: true, memberTimezone: true, groupId: true, userId: true },
  });

  if (!membership) throw httpError(403, "Not a member of this group");

  req.membership = membership;
  next();
}

/** Ensures the current user owns :groupId. */
export async function requireGroupOwner(req: Request, _res: Response, next: NextFunction) {
  const userId = req.user?.id;
  const groupId = req.params.groupId;
  if (!userId) throw httpError(401, "Unauthorized");
  if (!groupId) throw httpError(400, "Missing groupId in route params");

  const group = await prisma.streakGroup.findUnique({
    where: { id: groupId },
    select: { ownerId: true },
  });

  if (!group) throw httpError(404, "Group not found");
  if (group.ownerId !== userId) throw httpError(403, "Only the group owner can perform this action");

  next();
}
