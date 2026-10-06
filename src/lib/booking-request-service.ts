import { prisma } from "./prisma";
import { BookingRequestStatus } from "@prisma/client";
import { checkRoomAvailability, ConflictError, ValidationError, NotFoundError } from "./booking-service";
import { logAuditEvent } from "./audit-service";

export interface CreateBookingRequestParams {
  requesterId: string;
  roomId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
}

export interface ApproveBookingRequestParams {
  requestId: string;
  adminId: string;
  adminEmail?: string;
}

export interface RejectBookingRequestParams {
  requestId: string;
  adminId: string;
  adminEmail?: string;
  reason?: string | null;
}

/**
 * Creates a new booking request submitted by an employee.
 * Validates room active status, time intervals, and initial availability.
 */
export async function createBookingRequest(params: CreateBookingRequestParams) {
  const { requesterId, roomId, title, description, startTime, endTime } = params;

  if (endTime.getTime() <= startTime.getTime()) {
    throw new ValidationError("End time must be strictly after start time.");
  }

  // 1. Verify room exists and is active
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw new NotFoundError("Conference room not found.");
  }

  if (!room.isActive) {
    throw new ValidationError(`Room '${room.name}' (${room.roomCode}) is deactivated and cannot be requested.`);
  }

  // 2. Check room availability
  const availability = await checkRoomAvailability({
    roomId,
    startTime,
    endTime,
  });

  if (!availability.isAvailable) {
    throw new ConflictError("This room is not available for the selected time.");
  }

  // 3. Create the BookingRequest in PENDING state
  const bookingRequest = await prisma.bookingRequest.create({
    data: {
      requesterId,
      roomId,
      title,
      description: description || null,
      startTime,
      endTime,
      status: "PENDING",
    },
    include: {
      room: true,
      requester: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  // 4. Log audit event
  await logAuditEvent({
    actorId: requesterId,
    actorEmail: bookingRequest.requester?.email,
    action: "BOOKING_REQUEST_CREATED",
    targetType: "BOOKING_REQUEST",
    targetId: bookingRequest.id,
    details: {
      roomCode: room.roomCode,
      roomName: room.name,
      title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    },
  });

  return bookingRequest;
}

/**
 * Approves a pending booking request by an administrator.
 * Safely re-checks room active status and availability in a database transaction before creating the confirmed booking.
 */
export async function approveBookingRequest(params: ApproveBookingRequestParams) {
  const { requestId, adminId, adminEmail } = params;

  const request = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    include: {
      room: true,
      requester: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  if (!request) {
    throw new NotFoundError("Booking request not found.");
  }

  if (request.status !== "PENDING") {
    throw new ValidationError(`Only pending requests can be approved. Current status: ${request.status}`);
  }

  if (!request.room.isActive) {
    throw new ValidationError(`Room '${request.room.name}' is currently inactive and cannot be booked.`);
  }

  // Execute approval and booking creation safely within a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Lock the room row to guarantee serial execution
    await tx.$executeRaw`SELECT id FROM "Room" WHERE id = ${request.roomId} FOR UPDATE`;

    // Re-check for overlapping confirmed bookings
    const overlap = await tx.booking.findFirst({
      where: {
        roomId: request.roomId,
        status: "CONFIRMED",
        startTime: { lt: request.endTime },
        endTime: { gt: request.startTime },
      },
      select: { id: true, title: true, startTime: true, endTime: true },
    });

    if (overlap) {
      throw new ConflictError("The room is no longer available for the requested time slot.");
    }

    // Create the confirmed booking
    const booking = await tx.booking.create({
      data: {
        roomId: request.roomId,
        createdById: request.requesterId,
        organizerName: request.requester.name,
        title: request.title,
        description: request.description,
        startTime: request.startTime,
        endTime: request.endTime,
        status: "CONFIRMED",
      },
      include: {
        room: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Update the booking request to APPROVED
    const updatedRequest = await tx.bookingRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedById: adminId,
        reviewedAt: new Date(),
        bookingId: booking.id,
      },
      include: {
        room: true,
        requester: {
          select: { id: true, name: true, email: true, role: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        booking: true,
      },
    });

    return { booking, request: updatedRequest };
  });

  // Log audit event
  await logAuditEvent({
    actorId: adminId,
    actorEmail: adminEmail || null,
    action: "BOOKING_REQUEST_APPROVED",
    targetType: "BOOKING_REQUEST",
    targetId: requestId,
    details: {
      bookingId: result.booking.id,
      roomCode: request.room.roomCode,
      requesterEmail: request.requester.email,
      title: request.title,
      startTime: request.startTime.toISOString(),
      endTime: request.endTime.toISOString(),
    },
  });

  return result;
}

/**
 * Rejects a pending booking request by an administrator.
 */
export async function rejectBookingRequest(params: RejectBookingRequestParams) {
  const { requestId, adminId, adminEmail, reason } = params;

  const request = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    include: {
      room: true,
      requester: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  if (!request) {
    throw new NotFoundError("Booking request not found.");
  }

  if (request.status !== "PENDING") {
    throw new ValidationError(`Only pending requests can be rejected. Current status: ${request.status}`);
  }

  const updatedRequest = await prisma.bookingRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: reason || null,
    },
    include: {
      room: true,
      requester: {
        select: { id: true, name: true, email: true, role: true },
      },
      reviewedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Log audit event
  await logAuditEvent({
    actorId: adminId,
    actorEmail: adminEmail || null,
    action: "BOOKING_REQUEST_REJECTED",
    targetType: "BOOKING_REQUEST",
    targetId: requestId,
    details: {
      roomCode: request.room.roomCode,
      requesterEmail: request.requester.email,
      title: request.title,
      rejectionReason: reason || null,
    },
  });

  return updatedRequest;
}

/**
 * Retrieves all booking requests for administrators with pagination and filtering.
 */
export async function getBookingRequests(options: {
  status?: BookingRequestStatus;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const { status, page = 1, limit = 20, search } = options;
  const skip = (Math.max(1, page) - 1) * limit;

  const whereClause: any = {};
  if (status) {
    whereClause.status = status;
  }
  if (search) {
    whereClause.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { requester: { name: { contains: search, mode: "insensitive" } } },
      { requester: { email: { contains: search, mode: "insensitive" } } },
      { room: { name: { contains: search, mode: "insensitive" } } },
      { room: { roomCode: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, requests] = await Promise.all([
    prisma.bookingRequest.count({ where: whereClause }),
    prisma.bookingRequest.findMany({
      where: whereClause,
      include: {
        room: true,
        requester: {
          select: { id: true, name: true, email: true, role: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        booking: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieves requests submitted by a specific employee.
 */
export async function getUserBookingRequests(options: {
  userId: string;
  status?: BookingRequestStatus;
  page?: number;
  limit?: number;
}) {
  const { userId, status, page = 1, limit = 20 } = options;
  const skip = (Math.max(1, page) - 1) * limit;

  const whereClause: any = { requesterId: userId };
  if (status) {
    whereClause.status = status;
  }

  const [total, requests] = await Promise.all([
    prisma.bookingRequest.count({ where: whereClause }),
    prisma.bookingRequest.findMany({
      where: whereClause,
      include: {
        room: true,
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        booking: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    requests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
