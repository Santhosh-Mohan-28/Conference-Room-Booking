/**
 * Super Admin Management & Target Protection
 *
 * Super Admin access is configured strictly via server-side environment variable
 * SUPER_ADMIN_EMAILS="admin1@co.com,admin2@co.com" (case-insensitive, whitespace-trimmed, multiple emails supported).
 *
 * IMPORTANT RULES:
 * 1. Role enum remains strictly "ADMIN" and "EMPLOYEE" in Prisma.
 * 2. Super Admin status is dynamically evaluated and grants access to User Master.
 * 3. Super Admin accounts are strictly protected: server rejects any deactivation,
 *    demotion, modification, or deletion with HTTP 403 Forbidden.
 */

export function getSuperAdminEmails(): string[] {
  const configured = process.env.SUPER_ADMIN_EMAILS || "";
  const initialAdmin = process.env.INITIAL_ADMIN_EMAIL || "";

  const emails = configured
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (initialAdmin && !emails.includes(initialAdmin.trim().toLowerCase())) {
    emails.push(initialAdmin.trim().toLowerCase());
  }

  return emails;
}

export function isSuperAdmin(emailOrId?: string | null): boolean {
  if (!emailOrId) return false;

  const normalized = emailOrId.trim().toLowerCase();
  const superAdminEmails = getSuperAdminEmails();

  return superAdminEmails.includes(normalized);
}

export function isTargetSuperAdminProtected(email?: string | null): boolean {
  return isSuperAdmin(email);
}

export function getSuperAdminIds(): string[] {
  return [];
}