import { NextRequest } from "next/server";
import { requireSuperAdmin, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, isTargetSuperAdminProtected } from "@/lib/super-admin";
import { logAuditEvent } from "@/lib/audit-service";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { z } from "zod";

const updateRoleSchema = z.object({
  role: z.enum(["ADMIN", "EMPLOYEE"]),
});

/**
 * PATCH /api/admin/users/[id]/role
 * Promotes (EMPLOYEE -> ADMIN) or Demotes (ADMIN -> EMPLOYEE) a user.
 * Strictly restricted to Super Administrators.
 * TARGET PROTECTION: Rejects any attempt to modify/demote a Super Admin with 403.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireSuperAdmin();
    const { id } = params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return errorResponse("User not found", 404);
    }

    // TARGET PROTECTION: Super Admin cannot be demoted or modified
    if (isTargetSuperAdminProtected(targetUser.email)) {
      return errorResponse(
        "Super Administrators are strictly protected and cannot be demoted or modified.",
        403
      );
    }

    const body = await req.json();
    const validated = updateRoleSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid role payload", 400, validated.error.flatten());
    }

    const newRole = validated.data.role;
    const previousRole = targetUser.role;

    if (previousRole === newRole) {
      return successResponse({ ...targetUser, isSuperAdmin: false });
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { role: newRole },
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "USER_ROLE_UPDATED",
      targetType: "USER",
      targetId: updatedUser.id,
      details: {
        targetEmail: updatedUser.email,
        previousRole,
        newRole,
        modifiedBy: admin.email,
      },
    });

    return successResponse({ ...updatedUser, isSuperAdmin: false });
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.statusCode === 403) {
        return errorResponse(error.message, 403);
      }
      return unauthorizedResponse(error.message);
    }

    console.error("PATCH /api/admin/users/[id]/role error:", error);
    return errorResponse("Failed to update user role", 500);
  }
}
