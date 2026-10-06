import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { rejectBookingRequest } from "@/lib/booking-request-service";
import { bookingRequestRejectSchema } from "@/lib/validations";
import { ValidationError, NotFoundError } from "@/lib/booking-service";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  notFoundResponse,
} from "@/lib/api-response";

/**
 * PATCH /api/booking-requests/[id]/reject
 * Administrator rejects a pending booking request.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();

    let reason: string | undefined = undefined;
    try {
      const body = await req.json();
      const validated = bookingRequestRejectSchema.safeParse(body);
      if (validated.success && validated.data.reason) {
        reason = validated.data.reason;
      }
    } catch {
      // Body is optional
    }

    const updated = await rejectBookingRequest({
      requestId: params.id,
      adminId: admin.id,
      adminEmail: admin.email,
      reason,
    });

    return successResponse(updated);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof NotFoundError) {
      return notFoundResponse(error.message);
    }

    console.error("PATCH /api/booking-requests/[id]/reject error:", error);
    return errorResponse("Failed to reject booking request", 500);
  }
}
