import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import {
  formatCompanyDate,
  parseCompanyDateTimeToUTC,
  COMPANY_TIMEZONE,
} from "@/lib/timezone";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const now = new Date();
    const todayDateStr = formatCompanyDate(now, "yyyy-MM-dd");
    const todayStartUTC = parseCompanyDateTimeToUTC(todayDateStr, "00:00:00");
    const todayEndUTC = addDays(todayStartUTC, 1);

    // 1. Fetch total active rooms
    const activeRooms = await prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        roomCode: true,
        building: true,
        floor: true,
        capacity: true,
        bookings: {
          where: {
            status: "CONFIRMED",
            startTime: { lte: now },
            endTime: { gte: now },
          },
          select: { id: true },
        },
      },
    });

    const totalRooms = activeRooms.length;
    let occupiedRoomsNow = 0;
    for (const r of activeRooms) {
      if (r.bookings.length > 0) {
        occupiedRoomsNow++;
      }
    }
    const availableRoomsNow = totalRooms - occupiedRoomsNow;

    // 2. Today's bookings
    const todayBookingsRaw = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startTime: { gte: todayStartUTC, lt: todayEndUTC },
      },
      include: {
        room: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // 3. Upcoming bookings (after right now)
    const upcomingBookingsRaw = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startTime: { gte: now },
      },
      include: {
        room: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { startTime: "asc" },
      take: 10,
    });

    // Sanitize for employees if necessary
    const todayBookings = todayBookingsRaw.map((b) => ({
      id: b.id,
      title: user.role === "ADMIN" ? b.title : b.title,
      organizerName: user.role === "ADMIN" ? b.organizerName : b.organizerName,
      roomId: b.roomId,
      roomName: b.room.name,
      roomCode: b.room.roomCode,
      building: b.room.building,
      floor: b.room.floor,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      status: b.status,
    }));

    const upcomingBookings = upcomingBookingsRaw.map((b) => ({
      id: b.id,
      title: user.role === "ADMIN" ? b.title : b.title,
      organizerName: user.role === "ADMIN" ? b.organizerName : b.organizerName,
      roomId: b.roomId,
      roomName: b.room.name,
      roomCode: b.room.roomCode,
      building: b.room.building,
      floor: b.room.floor,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      status: b.status,
    }));

    // 4. Pending booking requests count
    let pendingRequestsCount = 0;
    if (user.role === "ADMIN") {
      pendingRequestsCount = await prisma.bookingRequest.count({
        where: { status: "PENDING" },
      });
    } else {
      pendingRequestsCount = await prisma.bookingRequest.count({
        where: { requesterId: user.id, status: "PENDING" },
      });
    }

    // 5. Admin specific: Recent audit activity
    let recentActivity = null;
    if (user.role === "ADMIN") {
      recentActivity = await prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          actor: {
            select: { name: true, email: true },
          },
        },
      });
    }

    return successResponse({
      timezone: COMPANY_TIMEZONE,
      role: user.role,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      stats: {
        totalRooms,
        availableRoomsNow,
        occupiedRoomsNow,
        todayBookingsCount: todayBookings.length,
        upcomingBookingsCount: upcomingBookings.length,
        pendingRequestsCount,
      },
      todayBookings,
      upcomingBookings,
      recentActivity,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/dashboard error:", error);
    return errorResponse("Failed to load dashboard metrics", 500);
  }
}
