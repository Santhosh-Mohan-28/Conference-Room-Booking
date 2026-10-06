import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { approveBookingRequest } from "@/lib/booking-request-service";
import { ConflictError, ValidationError, NotFoundError } from "@/lib/booking-service";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  conflictResponse,
  notFoundResponse,
} from "@/lib/api-response";

/**
 * PATCH /api/booking-requests/[id]/approve
 * Administrator approves a pending booking request.
 * Safely rechecks room availability before confirming the booking.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();

    const result = await approveBookingRequest({
      requestId: params.id,
      adminId: admin.id,
      adminEmail: admin.email,
    });

    return successResponse(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    if (error instanceof ConflictError) {
      return conflictResponse(error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof NotFoundError) {
      return notFoundResponse(error.message);
    }

    console.error("PATCH /api/booking-requests/[id]/approve error:", error);
    return errorResponse("Failed to approve booking request", 500);
  }
}
