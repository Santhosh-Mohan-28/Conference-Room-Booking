import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { cancelBooking, NotFoundError } from "@/lib/booking-service";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  notFoundResponse,
} from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit-service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { id } = params;

    const cancelled = await cancelBooking(id);

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "BOOKING_CANCELLED",
      targetType: "BOOKING",
      targetId: id,
      details: {
        title: cancelled.title,
        roomId: cancelled.roomId,
        roomName: cancelled.room?.name,
        startTime: cancelled.startTime.toISOString(),
        endTime: cancelled.endTime.toISOString(),
      },
    });

    return successResponse({
      message: "Booking was successfully cancelled. Reservation history has been preserved.",
      booking: cancelled,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    if (error instanceof NotFoundError) {
      return notFoundResponse(error.message);
    }
    console.error("POST /api/bookings/:id/cancel error:", error);
    return errorResponse("Failed to cancel booking", 500);
  }
}
