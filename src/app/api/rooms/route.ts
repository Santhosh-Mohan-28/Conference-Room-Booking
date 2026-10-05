import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession, requireAdmin, requireAuth, AuthError } from "@/lib/auth";
import { roomCreateSchema } from "@/lib/validations";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  conflictResponse,
} from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit-service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const building = searchParams.get("building") || undefined;
    const floor = searchParams.get("floor") ? parseInt(searchParams.get("floor")!) : undefined;
    const minCapacity = searchParams.get("minCapacity")
      ? parseInt(searchParams.get("minCapacity")!)
      : undefined;
    const equipment = searchParams.getAll("equipment");
    const includeInactive = user.role === "ADMIN" && searchParams.get("includeInactive") === "true";

    const now = new Date();

    const rooms = await prisma.room.findMany({
      where: {
        isActive: includeInactive ? undefined : true,
        building: building || undefined,
        floor: floor !== undefined && !isNaN(floor) ? floor : undefined,
        capacity: minCapacity ? { gte: minCapacity } : undefined,
        equipment: equipment.length > 0 ? { hasEvery: equipment } : undefined,
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              { roomCode: { contains: search, mode: "insensitive" } },
              { building: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: {
        bookings: {
          where: {
            status: "CONFIRMED",
            startTime: { lte: now },
            endTime: { gte: now },
          },
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
          },
        },
        _count: {
          select: {
            bookings: {
              where: { status: "CONFIRMED", endTime: { gte: now } },
            },
          },
        },
      },
      orderBy: [{ building: "asc" }, { floor: "asc" }, { roomCode: "asc" }],
    });

    const transformedRooms = rooms.map((r) => {
      const isCurrentlyOccupied = r.bookings.length > 0;
      return {
        id: r.id,
        roomCode: r.roomCode,
        name: r.name,
        building: r.building,
        floor: r.floor,
        capacity: r.capacity,
        description: r.description,
        equipment: r.equipment,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isCurrentlyOccupied,
        activeBooking: isCurrentlyOccupied
          ? {
              id: r.bookings[0].id,
              title: user.role === "ADMIN" ? r.bookings[0].title : "Occupied",
              startTime: r.bookings[0].startTime,
              endTime: r.bookings[0].endTime,
            }
          : null,
        upcomingBookingsCount: r._count.bookings,
      };
    });

    return successResponse(transformedRooms);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/rooms error:", error);
    return errorResponse("Failed to retrieve conference rooms", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();

    const body = await req.json();
    const validatedData = roomCreateSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid room data submitted", 400, validatedData.error.flatten());
    }

    const { roomCode, name, building, floor, capacity, description, equipment, isActive } =
      validatedData.data;

    // Check for duplicate room code
    const existing = await prisma.room.findUnique({
      where: { roomCode },
    });

    if (existing) {
      return conflictResponse(`A conference room with code '${roomCode}' already exists.`);
    }

    const room = await prisma.room.create({
      data: {
        roomCode,
        name,
        building,
        floor,
        capacity,
        description: description || null,
        equipment,
        isActive,
      },
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ROOM_CREATED",
      targetType: "ROOM",
      targetId: room.id,
      details: {
        roomCode: room.roomCode,
        name: room.name,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
      },
    });

    return successResponse(room, 201);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("POST /api/rooms error:", error);
    return errorResponse("Failed to create conference room", 500);
  }
}
