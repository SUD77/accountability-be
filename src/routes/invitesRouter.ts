// src/routes/invitesRouter.ts
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireGroupOwner } from "../middleware/guards";
import { httpError } from "../utils/httpError";
import { Email } from "../schema";

const r = Router();

/* ---------------------------------------------
   Config
----------------------------------------------*/

// TTL in days for invites (defaults to 7 if not set/invalid)
const INVITES_TTL_DAYS = Math.max(
  1,
  Math.min(30, Number(process.env.INVITES_TTL_DAYS ?? 7) || 7)
);

/* ---------------------------------------------
   Zod schemas
----------------------------------------------*/

const UUID = z.string().uuid();
const GroupIdParams = z.object({ groupId: UUID });

const CreateInviteBody = z.object({
  email: Email, // normalized to lowercase
});

const AcceptInviteBody = z.object({
  token: z.string().min(16).max(256),
});

const InviteIdParams = z.object({
  inviteId: UUID,
});

/* ---------------------------------------------
   Helpers
----------------------------------------------*/

// Generate a random URL-safe token; unique constraint on DB will enforce uniqueness.
// In the unlikely event of a collision, we retry up to 3 times.
async function generateUniqueToken(): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const token = crypto.randomBytes(24).toString("hex"); // 48 chars
    // We don't check existence here; we rely on DB unique index and catch/loop on conflict.
    return token;
  }
  // Fallback (practically never reached)
  return crypto.randomBytes(32).toString("hex");
}

function computeExpiry(): Date {
  const ms = INVITES_TTL_DAYS * 86_400_000;
  return new Date(Date.now() + ms);
}

/* ---------------------------------------------
   POST /groups/:groupId/invites  (OWNER ONLY)
   - Creates (or refreshes) a pending invite for an email
   - Private & Public groups both supported
----------------------------------------------*/
r.post(
  "/groups/:groupId/invites",
  requireAuth,
  requireGroupOwner,
  async (req, res, next) => {
    try {
      const { groupId } = GroupIdParams.parse(req.params);
      const body = CreateInviteBody.parse(req.body);

      // Disallow inviting an already-active member
      const activeMember = await prisma.groupMembership.findFirst({
        where: { groupId, user: { email: body.email }, status: "active" },
        select: { id: true },
      });
      if (activeMember) {
        throw httpError(409, "User is already a member of this group");
      }

      // If there's an existing pending invite for the same email+group, refresh its expiry (keep the token stable)
      const existing = await prisma.invite.findFirst({
        where: { groupId, email: body.email, status: "pending" },
      });

      if (existing) {
        const refreshed = await prisma.invite.update({
          where: { id: existing.id },
          data: {
            expiresAt: computeExpiry(),
            // keep token, keep status=pending
          },
        });
        return res.status(200).json(refreshed);
      }

      // Else create a fresh invite
      let created;
      try {
        created = await prisma.invite.create({
          data: {
            groupId,
            inviterId: req.user!.id,
            email: body.email,
            token: await generateUniqueToken(),
            expiresAt: computeExpiry(),
            status: "pending",
            // sentAt default now()
          },
        });
      } catch (err: any) {
        // Unique token collision (extremely rare)
        if (err?.code === "P2002" && err?.meta?.target?.includes("token")) {
          // Retry once with a new token
          created = await prisma.invite.create({
            data: {
              groupId,
              inviterId: req.user!.id,
              email: body.email,
              token: await generateUniqueToken(),
              expiresAt: computeExpiry(),
              status: "pending",
            },
          });
        } else {
          throw err;
        }
      }

      // (Email sending happens outside this router; this endpoint only issues/refreshes tokens.)
      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid request body/params", err.issues));
      return next(err);
    }
  }
);

/* ---------------------------------------------
   GET /groups/:groupId/invites  (OWNER ONLY)
   - List invites for a group
----------------------------------------------*/
r.get(
  "/groups/:groupId/invites",
  requireAuth,
  requireGroupOwner,
  async (req, res, next) => {
    try {
      const { groupId } = GroupIdParams.parse(req.params);
      const invites = await prisma.invite.findMany({
        where: { groupId },
        orderBy: [{ status: "asc" }, { sentAt: "desc" }],
      });
      return res.json(invites);
    } catch (err: any) {
      if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
      return next(err);
    }
  }
);

/* ---------------------------------------------
   DELETE /invites/:inviteId  (OWNER ONLY)
   - Revokes a pending invite
   - Idempotent for non-pending (accepted/revoked/expired)
----------------------------------------------*/
r.delete("/invites/:inviteId", requireAuth, async (req, res, next) => {
  try {
    const { inviteId } = InviteIdParams.parse(req.params);

    // Load invite + group to verify owner
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      select: { id: true, status: true, groupId: true },
    });
    if (!invite) return res.status(204).send(); // idempotent

    // Check current user owns the group
    const group = await prisma.streakGroup.findUnique({
      where: { id: invite.groupId },
      select: { ownerId: true },
    });
    if (!group) return res.status(204).send(); // group gone
    if (group.ownerId !== req.user!.id) throw httpError(403, "Only the group owner can revoke invites");

    // If already not pending, return 204
    if (invite.status !== "pending") return res.status(204).send();

    await prisma.invite.update({
      where: { id: inviteId },
      data: { status: "revoked" },
    });

    return res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid route params", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   POST /invites/accept  (AUTH REQUIRED)
   - Accept an invite by token
   - Creates (or re-activates) membership for the caller
   - Idempotent
----------------------------------------------*/
r.post("/invites/accept", requireAuth, async (req, res, next) => {
  try {
    const body = AcceptInviteBody.parse(req.body);

    // Look up invite by token
    const invite = await prisma.invite.findUnique({
      where: { token: body.token },
      select: {
        id: true,
        groupId: true,
        email: true,
        status: true,
        expiresAt: true,
      },
    });

    // Generic "invalid" to avoid token enumeration
    if (!invite) throw httpError(400, "Invalid or expired invite");

    // Expiry check; mark expired if needed
    const now = new Date();
    if (invite.status === "pending" && invite.expiresAt < now) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });
      throw httpError(400, "Invalid or expired invite");
    }

    if (invite.status !== "pending") {
      throw httpError(400, "Invalid or expired invite");
    }

    // Snapshot current timezone of the accepting user
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { timezone: true },
    });
    const tz = me?.timezone ?? "Asia/Kolkata";

    // Create/activate membership transactionally, mark invite accepted
    const result = await prisma.$transaction(async (tx) => {
      // Create or reactivate membership
      const existing = await tx.groupMembership.findFirst({
        where: { groupId: invite.groupId, userId: req.user!.id },
      });

      let membershipId: string;
      if (!existing) {
        const created = await tx.groupMembership.create({
          data: {
            groupId: invite.groupId,
            userId: req.user!.id,
            role: "member",
            status: "active",
            memberTimezone: tz,
          },
          select: { id: true },
        });
        membershipId = created.id;
      } else if (existing.status !== "active") {
        const updated = await tx.groupMembership.update({
          where: { id: existing.id },
          data: { status: "active", leftAt: null, memberTimezone: tz },
          select: { id: true },
        });
        membershipId = updated.id;
      } else {
        membershipId = existing.id; // already active → idempotent
      }

      // Mark invite as accepted
      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedByUserId: req.user!.id,
          acceptedAt: new Date(),
        },
      });

      return { groupId: invite.groupId, membershipId, inviteId: invite.id };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid request body", err.issues));
    return next(err);
  }
});

export default r;
