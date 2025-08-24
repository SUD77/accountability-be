// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { requireAuth, issueToken } from "../middleware/auth";
import { httpError } from "../utils/httpError";
import { z } from "zod";
import { Email, Password } from "../schema";

const r = Router();

/* ---------------------------------------------
   Helpers (validation & formatting)
----------------------------------------------*/

// Cheap, dependency-free IANA timezone validation.
// Throws if the string isn't a valid IANA zone.
function assertValidTimezone(tz: string) {
  try {
    // Intl API throws for unknown timezones
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw httpError(400, `Invalid timezone: ${tz}`);
  }
}

// Normalize display name: trim + collapse internal whitespace
function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/* ---------------------------------------------
   Zod schemas for request bodies
----------------------------------------------*/

const SignupBody = z.object({
  email: Email,                        // normalized to lowercase via Email transform
  password: Password,                  // 8–72 chars
  display_name: z.string().min(2).max(40).optional(),
  timezone: z.string().optional(),     // validate via Intl in handler
});

const LoginBody = z.object({
  email: Email,
  password: Password,
});

const PatchMeBody = z.object({
  display_name: z.string().min(2).max(40).optional(),
  timezone: z.string().optional(),
});

/* ---------------------------------------------
   POST /auth/signup
   - Create user with bcrypt hash
   - Return { token, user }
   - This also, returns a token, as it can help new users to login directly, if they sign up. 
----------------------------------------------*/
r.post("/auth/signup", async (req, res, next) => {
  try {
    const body = SignupBody.parse(req.body);

    if (body.timezone) assertValidTimezone(body.timezone);

    // Hash password with bcrypt (12 rounds is a good default)
    const SALT_ROUNDS = 12;
    const hash = await bcrypt.hash(body.password, SALT_ROUNDS);

    // Create user (email is already lowercased by schema)
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: hash,
        displayName: body.display_name ? normalizeName(body.display_name) : null,
        timezone: body.timezone ?? "Asia/Kolkata",
        // lastLoginAt remains null until actual login
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        lastLoginAt: true,
      },
    });

    // Issue JWT (7d default; configured in Phase 0)
    const token = issueToken({ id: user.id, email: user.email });

    return res.status(201).json({ token, user });
  } catch (err: any) {
    // Handle duplicate email nicely (Prisma P2002 = unique constraint)
    if (err?.code === "P2002" && err?.meta?.target?.includes("email")) {
      return next(httpError(409, "Email already in use"));
    }
    // Zod errors return 400 with details
    if (err?.issues) {
      return next(httpError(400, "Invalid request body", err.issues));
    }
    return next(err);
  }
});

/* ---------------------------------------------
   POST /auth/login
   - Verify credentials
   - Update last_login_at
   - Return { token, user }
----------------------------------------------*/
r.post("/auth/login", async (req, res, next) => {
  try {
    const body = LoginBody.parse(req.body);

    const userRow = await prisma.user.findUnique({
      where: { email: body.email }, // already lowercased
      select: {
        id: true,
        email: true,
        passwordHash: true,
        displayName: true,
        timezone: true,
        lastLoginAt: true,
      },
    });

    // Generic error to avoid leaking which field failed
    if (!userRow?.passwordHash) throw httpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(body.password, userRow.passwordHash);
    if (!ok) throw httpError(401, "Invalid credentials");

    // Update last_login_at (best-effort; do not block response)
    await prisma.user.update({
      where: { id: userRow.id },
      data: { lastLoginAt: new Date() },
      select: { id: true }, // minimal select
    });

    const { passwordHash: _omit, ...user } = userRow;

    const token = issueToken({ id: user.id, email: user.email });
    return res.json({ token, user });
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid request body", err.issues));
    return next(err);
  }
});

/* ---------------------------------------------
   POST /auth/logout
   - Stateless JWT: client drops token
----------------------------------------------*/
r.post("/auth/logout", (_req, res) => {
  // If you move to httpOnly cookies later, you can clear them here.
  return res.status(204).send();
});

/* ---------------------------------------------
   GET /me
   - Requires auth
   - Returns current user's profile
----------------------------------------------*/
r.get("/me", requireAuth, async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        lastLoginAt: true,
      },
    });
    if (!me) throw httpError(404, "User not found");
    return res.json(me);
  } catch (err) {
    return next(err);
  }
});

/* ---------------------------------------------
   PATCH /me
   - Update display_name / timezone (optional in Phase 1)
----------------------------------------------*/
r.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const body = PatchMeBody.parse(req.body);

    const data: any = {};
    if (body.display_name !== undefined) {
      data.displayName = normalizeName(body.display_name);
    }
    if (body.timezone !== undefined) {
      assertValidTimezone(body.timezone);
      data.timezone = body.timezone;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        lastLoginAt: true,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    if (err?.issues) return next(httpError(400, "Invalid request body", err.issues));
    return next(err);
  }
});

export default r;
