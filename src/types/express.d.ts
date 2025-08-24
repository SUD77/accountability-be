// src/types/express.d.ts
import type { AuthUser } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth */
      user?: AuthUser;
      /** Set by requireGroupMember (optional convenience) */
      membership?: {
        id: string;
        role: "owner" | "member";
        memberTimezone: string;
        groupId: string;
        userId: string;
      };
    }
  }
}

export {}; // make this a module
