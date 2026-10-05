import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { UserSession } from "@/types";

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
 */
export async function requireAuth(): Promise<UserSession> {
  const user = await getServerAuthSession();
  if (!user) {
    throw new AuthError("Authentication required. Please sign in.", 401);
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
