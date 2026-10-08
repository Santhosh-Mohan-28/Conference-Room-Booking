import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { UserSession } from "@/types";
import { isSuperAdmin } from "./super-admin";

export async function getServerAuthSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as unknown as UserSession;
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * Ensures the caller is authenticated. Throws AuthError(401) if not.
 * Inactive users are blocked with AuthError(403).
 */
export async function requireAuth(): Promise<UserSession> {
  const user = await getServerAuthSession();
  if (!user) {
    throw new AuthError("Authentication required. Please sign in.", 401);
  }

  if (user.isActive === false) {
    throw new AuthError(
      "Access denied: Your account is inactive or pending approval. Please contact a Super Administrator.",
      403
    );
  }

  return user;
}

/**
 * Ensures the caller is authenticated AND has the ADMIN role.
 * Throws AuthError(401) or AuthError(403) if unauthorized.
 */
export async function requireAdmin(): Promise<UserSession> {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new AuthError("Access denied: Administrator privileges required.", 403);
  }
  return user;
}

/**
 * Ensures the caller is authenticated AND is a configured Super Administrator.
 * Throws AuthError(401) or AuthError(403) if unauthorized.
 */
export async function requireSuperAdmin(): Promise<UserSession> {
  const user = await requireAuth();
  if (!isSuperAdmin(user.email)) {
    throw new AuthError("Access denied: Super Administrator privileges required.", 403);
  }
  return user;
}
