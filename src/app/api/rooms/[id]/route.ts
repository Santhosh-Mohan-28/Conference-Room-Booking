import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, AuthError } from "@/lib/auth";
import { roomUpdateSchema } from "@/lib/validations";
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
    const user = await requireAuth();
    const { id } = params;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        bookings: {
          where: {
            status: "CONFIRMED",
            endTime: { gte: new Date() },
          },
          orderBy: { startTime: "asc" },
          take: 10,
          select: {
            id: true,
            title: true,
            organizerName: true,
            startTime: true,
            endTime: true,
            status: true,
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!room) {
      return notFoundResponse("Conference room not found.");
    }

    if (!room.isActive && user.role !== "ADMIN") {
      return notFoundResponse("Conference room is currently not available.");
    }

    // Obfuscate sensitive meeting organizer/title info for normal employees if necessary
    const sanitizedBookings = room.bookings.map((b) => ({
      id: b.id,
      title: user.role === "ADMIN" ? b.title : "Reserved Meeting",
      organizerName: user.role === "ADMIN" ? b.organizerName : undefined,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
    }));

    return successResponse({
      ...room,
      bookings: sanitizedBookings,
      totalBookingsCount: room._count.bookings,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/rooms/:id error:", error);
    return errorResponse("Failed to retrieve room details", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { id } = params;

    const existingRoom = await prisma.room.findUnique({
      where: { id },
    });

    if (!existingRoom) {
      return notFoundResponse("Conference room not found.");
    }

    const body = await req.json();
    const validated = roomUpdateSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid room update data", 400, validated.error.flatten());
    }

    const updateData = validated.data;

    // Check unique roomCode conflict
    if (updateData.roomCode && updateData.roomCode !== existingRoom.roomCode) {
      const duplicate = await prisma.room.findUnique({
        where: { roomCode: updateData.roomCode },
      });
      if (duplicate) {
        return conflictResponse(`Room code '${updateData.roomCode}' is already in use.`);
      }
    }

    // Safety rule for deactivation: check for future active bookings
    if (updateData.isActive === false && existingRoom.isActive === true) {
      const now = new Date();
      const futureBookings = await prisma.booking.findMany({
        where: {
          roomId: id,
          status: "CONFIRMED",
          endTime: { gt: now },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      });

      if (futureBookings.length > 0) {
        return errorResponse(
          `Cannot deactivate room: There are ${futureBookings.length} upcoming confirmed booking(s). Please cancel or relocate these bookings before deactivating the room.`,
          409,
          { futureBookings }
        );
      }
    }

    const updatedRoom = await prisma.room.update({
      where: { id },
      data: updateData,
    });

    // Determine audit action
    let auditAction = "ROOM_UPDATED";
    if (existingRoom.isActive !== updatedRoom.isActive) {
      auditAction = updatedRoom.isActive ? "ROOM_REACTIVATED" : "ROOM_DEACTIVATED";
    }

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: auditAction as any,
      targetType: "ROOM",
      targetId: id,
      details: {
        previous: {
          name: existingRoom.name,
          roomCode: existingRoom.roomCode,
          isActive: existingRoom.isActive,
        },
        updated: {
          name: updatedRoom.name,
          roomCode: updatedRoom.roomCode,
          isActive: updatedRoom.isActive,
        },
      },
    });

    return successResponse(updatedRoom);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("PATCH /api/rooms/:id error:", error);
    return errorResponse("Failed to update conference room", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { id } = params;

    const existingRoom = await prisma.room.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!existingRoom) {
      return notFoundResponse("Conference room not found.");
    }

    // Safety rule: Never delete a room with booking history to preserve integrity
    if (existingRoom._count.bookings > 0) {
      return errorResponse(
        `Cannot permanently delete room '${existingRoom.name}' (${existingRoom.roomCode}): It contains ${existingRoom._count.bookings} historical booking record(s). Deactivate the room instead to preserve audit and reservation history.`,
        400
      );
    }

    await prisma.room.delete({
      where: { id },
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ROOM_DELETED",
      targetType: "ROOM",
      targetId: id,
      details: {
        roomCode: existingRoom.roomCode,
        name: existingRoom.name,
        building: existingRoom.building,
      },
    });

    return successResponse({
      message: `Room '${existingRoom.name}' (${existingRoom.roomCode}) was successfully deleted.`,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("DELETE /api/rooms/:id error:", error);
    return errorResponse("Failed to delete room", 500);
  }
}
