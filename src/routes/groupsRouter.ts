// src/routes/groupsRouter.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { httpError } from "../utils/httpError";
import { z } from "zod";
import { GroupVisibility } from "../schema";

const r = Router();

/* ---------------------------------------------
   Helpers
----------------------------------------------*/

// Trim + collapse whitespace in names
function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

// YYYY-MM-DD from a Date (using UTC components so server TZ doesn’t matter)
const pad = (n: number) => `${n}`.padStart(2, "0");
const toYMD = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Today as YYYY-MM-DD (UTC)
const todayYMD = () => toYMD(new Date());

// Compute a display status for reads (doesn’t mutate DB):
//  - upcoming: today < start
//  - completed: today > end
//  - active: else
function computeStatus(startDate: Date, endDate: Date): "upcoming" | "active" | "completed" {
  const t = todayYMD();
  const s = toYMD(startDate);
  const e = toYMD(endDate);
  if (t < s) return "upcoming";
  if (t > e) return "completed";
  return "active";
}

// Duration guard: 1..180 days inclusive
function assertDurationWithinBounds(startDate: Date, endDate: Date) {
  const s = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const e = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  if (e <= s) throw httpError(400, "end_date must be after start_date");
  const days = Math.floor((e - s) / 86_400_000) + 1;
  if (days < 1 || days > 180) throw httpError(400, "Group duration must be between 1 and 180 days");
}

/* ---------------------------------------------
   Zod request schemas
----------------------------------------------*/

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const CreateGroupBody = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(500).optional(),
  start_date: DateStr,
  end_date: DateStr,
  visibility: GroupVisibility.default("private"),
});

const ListGroupsQuery = z.object({
  scope: z.enum(["mine", "public"]).default("mine"),
  status: z.enum(["active", "upcoming", "completed"]).optional(),
  // optional paging if you want later: page, limit, cursor, etc.
});

const GroupIdParams = z.object({
  groupId: z.string().uuid(),
});

/* ---------------------------------------------
   POST /groups  (create group; owner membership auto-created)
----------------------------------------------*/
r.post("/groups", requireAuth, async (req, res, next) => {
  try {
    const body = CreateGroupBody.parse(req.body);

    // Convert to Date (stored as DATE in DB)
    const start = new Date(body.start_date);
    const end = new Date(body.end_date);

    assertDurationWithinBounds(start, end);

    // Snapshot owner timezone from user row (fallback to "Asia/Kolkata")
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { timezone: true },
    });
    const tz = me?.timezone ?? "Asia/Kolkata";

    // Create group + owner membership (transaction keeps them in sync)
    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.streakGroup.create({
        data: {
          ownerId: req.user!.id,
          name: normalizeName(body.name),
          description: body.description ?? null,
          startDate: start,
          endDate: end,
          visibility: body.visibility,
          status: "scheduled", // create-time status; reads will compute current status
        },
      });

      const membership = await tx.groupMembership.create({
        data: {
          groupId: group.id,
          userId: req.user!.id,
          role: "owner",
          status: "active",
          memberTimezone: tz,
        },
        select: { id: true },
      });

      return { group, ownerMembershipId: membership.id };
    });

    // Include a computed_status hint for the client
    const computed_status = computeStatus(created.group.startDate, created.group.endDate);

    return res.status(201).json({
      ...created.group,
      owner_membership_id: created.ownerMembershipId,
      computed_status,
    });
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid request body", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   GET /groups  (list groups)
   - scope=mine|public (default mine)
   - status=active|upcoming|completed (optional filter)
----------------------------------------------*/
r.get("/groups", requireAuth, async (req, res, next) => {
  try {
    const q = ListGroupsQuery.parse(req.query);

    if (q.scope === "public") {
      // Public groups, visible to all authenticated users
      const groups = await prisma.streakGroup.findMany({
        where: { visibility: "public" },
        orderBy: { startDate: "desc" },
        take: 100, // keep it reasonable; tune later
      });

      const enriched = groups
        .map((g) => ({
          ...g,
          computed_status: computeStatus(g.startDate, g.endDate),
        }))
        .filter((g) => (q.status ? g.computed_status === q.status : true));

      return res.json(enriched);
    }

    // scope = "mine": groups where I am an active member
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: req.user!.id, status: "active" },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) return res.json([]);

    const groups = await prisma.streakGroup.findMany({
      where: { id: { in: groupIds } },
      orderBy: { startDate: "desc" },
      take: 100,
    });

    const enriched = groups
      .map((g) => ({
        ...g,
        computed_status: computeStatus(g.startDate, g.endDate),
      }))
      .filter((g) => (q.status ? g.computed_status === q.status : true));

    return res.json(enriched);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid query params", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   GET /groups/:groupId  (group details)
   - Private groups are only visible to members
   - Public groups are visible to any authenticated user
----------------------------------------------*/
r.get("/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = GroupIdParams.parse(req.params);

    const group = await prisma.streakGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) throw httpError(404, "Group not found");

    if (group.visibility === "private") {
      const member = await prisma.groupMembership.findFirst({
        where: { groupId, userId: req.user!.id, status: "active" },
        select: { id: true },
      });
      // Hide existence for non-members of private groups
      if (!member) throw httpError(404, "Group not found");
    }

    const computed_status = computeStatus(group.startDate, group.endDate);
    return res.json({ ...group, computed_status });
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
    return next(err);
  }
});

export default r;
