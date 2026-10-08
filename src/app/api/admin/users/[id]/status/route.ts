import { NextRequest } from "next/server";
import { requireSuperAdmin, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTargetSuperAdminProtected } from "@/lib/super-admin";
import { logAuditEvent } from "@/lib/audit-service";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { z } from "zod";

const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

/**
 * PATCH /api/admin/users/[id]/status
 * Activates or deactivates a user account.
 * Strictly restricted to Super Administrators.
 * TARGET PROTECTION: Rejects any attempt to deactivate a Super Admin with 403.
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

    const body = await req.json();
    const validated = updateStatusSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid status payload", 400, validated.error.flatten());
    }

    const { isActive } = validated.data;

    // TARGET PROTECTION: Super Admin cannot be deactivated or have their active status revoked
    if (!isActive && isTargetSuperAdminProtected(targetUser.email)) {
      return errorResponse(
        "Super Administrators are strictly protected and cannot be deactivated.",
        403
      );
    }

    const previousStatus = targetUser.isActive;

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { isActive },
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "USER_STATUS_UPDATED",
      targetType: "USER",
      targetId: updatedUser.id,
      details: {
        targetEmail: updatedUser.email,
        previousStatus,
        newStatus: isActive,
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

    console.error("PATCH /api/admin/users/[id]/status error:", error);
    return errorResponse("Failed to update user status", 500);
  }
}
