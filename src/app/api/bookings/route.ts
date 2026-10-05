import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { bookingCreateSchema } from "@/lib/validations";
import { createBooking, ConflictError, ValidationError } from "@/lib/booking-service";
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
    const admin = await requireAdmin();

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId") || undefined;
    const status = searchParams.get("status") as "CONFIRMED" | "CANCELLED" | undefined;
    const timeframe = searchParams.get("timeframe") || "all";
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const now = new Date();
    const whereClause: any = {
      roomId: roomId || undefined,
      status: status || undefined,
    };

    if (timeframe === "upcoming") {
      whereClause.endTime = { gte: now };
    } else if (timeframe === "past") {
      whereClause.endTime = { lt: now };
    }

    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) whereClause.startTime.gte = startDate;
      if (endDate) whereClause.startTime.lte = endDate;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { organizerName: { contains: search, mode: "insensitive" } },
        { room: { name: { contains: search, mode: "insensitive" } } },
        { room: { roomCode: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where: whereClause }),
      prisma.booking.findMany({
        where: whereClause,
        include: {
          room: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { startTime: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return successResponse({
      bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/bookings error:", error);
    return errorResponse("Failed to retrieve bookings", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();

    const body = await req.json();
    const validated = bookingCreateSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid booking submission", 400, validated.error.flatten());
    }

    const { roomId, title, description, organizerName, startTime, endTime } = validated.data;
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Business rule: prevent creating bookings entirely in the past
    // Allow small grace window of 2 minutes for network transit
    const gracePastWindow = new Date(Date.now() - 2 * 60 * 1000);
    if (end < gracePastWindow) {
      return errorResponse("Cannot create conference room bookings entirely in the past.", 400);
    }

    const booking = await createBooking({
      roomId,
      createdById: admin.id,
      organizerName,
      title,
      description: description || null,
      startTime: start,
      endTime: end,
    });

    await logAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "BOOKING_CREATED",
      targetType: "BOOKING",
      targetId: booking.id,
      details: {
        roomId: booking.roomId,
        roomName: booking.room.name,
        roomCode: booking.room.roomCode,
        title: booking.title,
        organizerName: booking.organizerName,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
      },
    });

    return successResponse(booking, 201);
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
    console.error("POST /api/bookings error:", error);
    return errorResponse("Failed to create booking", 500);
  }
}
