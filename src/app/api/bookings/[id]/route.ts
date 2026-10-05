import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { bookingUpdateSchema } from "@/lib/validations";
import { updateBooking, ConflictError, ValidationError, NotFoundError } from "@/lib/booking-service";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
} from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit-service";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { id } = params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        room: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!booking) {
      return notFoundResponse("Booking not found.");
    }

    return successResponse(booking);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/bookings/:id error:", error);
    return errorResponse("Failed to retrieve booking details", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { id } = params;

    const body = await req.json();
    const validated = bookingUpdateSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid booking update data", 400, validated.error.flatten());
    }

    const { roomId, title, description, organizerName, startTime, endTime } = validated.data;

    const updated = await updateBooking({
      id,
      roomId,
      title,
      description,
      organizerName,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "BOOKING_UPDATED",
      targetType: "BOOKING",
      targetId: id,
      details: {
        title: updated.title,
        roomId: updated.roomId,
        roomName: updated.room.name,
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
      },
    });

    return successResponse(updated);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    if (error instanceof ConflictError) {
      return conflictResponse(error.message);
    }
    if (error instanceof NotFoundError) {
      return notFoundResponse(error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.message, 400);
    }
    console.error("PATCH /api/bookings/:id error:", error);
    return errorResponse("Failed to update booking", 500);
  }
}
