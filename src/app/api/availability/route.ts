import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { availabilityQuerySchema } from "@/lib/validations";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import {
  parseCompanyDateTimeToUTC,
  COMPANY_TIMEZONE,
  formatCompanyDate,
} from "@/lib/timezone";
import { startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const parsedQuery = availabilityQuerySchema.safeParse({
      date: searchParams.get("date") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      roomId: searchParams.get("roomId") || undefined,
      building: searchParams.get("building") || undefined,
      floor: searchParams.get("floor") || undefined,
      minCapacity: searchParams.get("minCapacity") || undefined,
      view: searchParams.get("view") || "daily",
    });

    if (!parsedQuery.success) {
      return errorResponse("Invalid availability query", 400, parsedQuery.error.flatten());
    }

    const { date, startDate, endDate, roomId, building, floor, minCapacity, view } =
      parsedQuery.data;

    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else {
      // Determine date range in company timezone
      const referenceDateStr = date || formatCompanyDate(new Date(), "yyyy-MM-dd");
      // Midnight start and end of that day in company timezone
      const dayStartUTC = parseCompanyDateTimeToUTC(referenceDateStr, "00:00:00");

      if (view === "weekly") {
        // Full week window (7 days)
        rangeStart = dayStartUTC;
        rangeEnd = addDays(dayStartUTC, 7);
      } else if (view === "monthly") {
        // 31 days window
        rangeStart = dayStartUTC;
        rangeEnd = addDays(dayStartUTC, 31);
      } else {
        // Daily view: 24-hour day in company timezone
        rangeStart = dayStartUTC;
        rangeEnd = addDays(dayStartUTC, 1);
      }
    }

    // Fetch active rooms matching filters
    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
        id: roomId || undefined,
        building: building || undefined,
        floor: floor !== undefined ? floor : undefined,
        capacity: minCapacity ? { gte: minCapacity } : undefined,
      },
      include: {
        bookings: {
          where: {
            status: "CONFIRMED",
            startTime: { lt: rangeEnd },
            endTime: { gt: rangeStart },
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            title: true,
            organizerName: true,
            startTime: true,
            endTime: true,
            status: true,
            createdById: true,
          },
        },
      },
      orderBy: [{ building: "asc" }, { floor: "asc" }, { roomCode: "asc" }],
    });

    const transformedRooms = rooms.map((room) => ({
      roomId: room.id,
      roomCode: room.roomCode,
      roomName: room.name,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      equipment: room.equipment,
      bookings: room.bookings.map((b) => ({
        id: b.id,
        // Only admins see detailed meeting titles if sensitive, or allow title for everyone with sanitized notes
        title: user.role === "ADMIN" ? b.title : b.title,
        organizerName: user.role === "ADMIN" ? b.organizerName : undefined,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        status: b.status,
      })),
    }));

    return successResponse({
      timezone: COMPANY_TIMEZONE,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      view,
      rooms: transformedRooms,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/availability error:", error);
    return errorResponse("Failed to calculate room availability", 500);
  }
}
