import type { Request, Response, NextFunction } from "express";
import jwt, {
  type Secret,
  type JwtPayload,
  type SignOptions,
} from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as Secret;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET env");
}

export type AuthUser = { id: string; email: string };

function httpError(status: number, message: string) {
  const e = new Error(message) as any;
  e.status = status;
  return e;
}

export function issueToken(
  user: AuthUser,
  opts?: { expiresIn?: SignOptions["expiresIn"] }
) {
  const payload: JwtPayload = { sub: user.id, email: user.email };

  // 7 days in seconds
  const DEFAULT_EXPIRES_IN = 60 * 60 * 24 * 7;

  const options: SignOptions = {
    expiresIn: opts?.expiresIn ?? DEFAULT_EXPIRES_IN,
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

function getTokenFromRequest(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) throw httpError(401, "Unauthorized");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const id = (decoded as any).id ?? decoded.sub;
    const email = (decoded as any).email;
    if (!id || !email) throw httpError(401, "Invalid token payload");
    req.user = { id: String(id), email: String(email) };
    next();
  } catch {
    throw httpError(401, "Invalid or expired token");
  }
}
