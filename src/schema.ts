// src/schemas.ts
import { z } from "zod";

// Primitives
export const UUID = z.string().uuid();
export const Email = z.string().email().transform((s) => s.trim().toLowerCase());
export const Password = z.string().min(8).max(72);
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// Enums (mirror Prisma)
export const GoalType = z.enum(["binary", "count"]);
export const GroupVisibility = z.enum(["public", "private"]);
export const GroupStatus = z.enum(["draft", "scheduled", "active", "completed", "cancelled"]);
export const MembershipRole = z.enum(["owner", "member"]);
export const MembershipStatus = z.enum(["active", "left", "removed"]);
export const InviteStatus = z.enum(["pending", "accepted", "revoked", "expired"]);

// Helper
export type Infer<T extends z.ZodTypeAny> = z.infer<T>;
