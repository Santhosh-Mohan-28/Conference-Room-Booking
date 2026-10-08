import { NextRequest } from "next/server";
import { requireSuperAdmin, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, getSuperAdminEmails } from "@/lib/super-admin";
import { logAuditEvent } from "@/lib/audit-service";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { z } from "zod";

const grantAccessSchema = z.object({
  email: z.string().email("A valid company email address is required"),
  name: z.string().min(1, "Name is required").optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

/**
 * GET /api/admin/users
 * Returns list of company users with search, role, and status filtering.
 * Strictly restricted to Super Administrators.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().toLowerCase();
    const roleParam = searchParams.get("role")?.trim().toUpperCase();
    const statusParam = searchParams.get("status")?.trim().toLowerCase();

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (roleParam === "ADMIN" || roleParam === "EMPLOYEE") {
      where.role = roleParam;
    }

    if (statusParam === "active") {
      where.isActive = true;
    } else if (statusParam === "inactive") {
      where.isActive = false;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const superAdminEmails = getSuperAdminEmails();

    const mappedUsers = users.map((u) => ({
      ...u,
      isSuperAdmin: isSuperAdmin(u.email),
    }));

    return successResponse({
      users: mappedUsers,
      total: mappedUsers.length,
      superAdminEmails,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.statusCode === 403) {
        return errorResponse(error.message, 403);
      }
      return unauthorizedResponse(error.message);
    }

    console.error("GET /api/admin/users error:", error);
    return errorResponse("Failed to fetch users", 500);
  }
}

/**
 * POST /api/admin/users
 * Pre-provisions or grants immediate active access to a company user.
 * Strictly restricted to Super Administrators.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin();

    const body = await req.json();
    const validated = grantAccessSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid user access payload", 400, validated.error.flatten());
    }

    const email = validated.data.email.trim().toLowerCase();
    const name = validated.data.name?.trim() || email.split("@")[0];
    const role = validated.data.role;

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // User exists: activate and update role if requested
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          role: isSuperAdmin(user.email) ? "ADMIN" : role,
          name: name || user.name,
        },
      });
    } else {
      // Create new active user
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: isSuperAdmin(email) ? "ADMIN" : role,
          isActive: true,
        },
      });
    }

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "USER_ACCESS_GRANTED",
      targetType: "USER",
      targetId: user.id,
      details: {
        email: user.email,
        assignedRole: user.role,
        grantedBy: admin.email,
      },
    });

    return successResponse(
      {
        ...user,
        isSuperAdmin: isSuperAdmin(user.email),
      },
      201
    );
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.statusCode === 403) {
        return errorResponse(error.message, 403);
      }
      return unauthorizedResponse(error.message);
    }

    console.error("POST /api/admin/users error:", error);
    return errorResponse("Failed to grant user access", 500);
  }
}
