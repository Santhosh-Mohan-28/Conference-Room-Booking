import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export class ConflictError extends Error {
  constructor(message = "The selected room is already booked for this time period.") {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface CheckAvailabilityParams {
  roomId: string;
  startTime: Date;
  endTime: Date;
  excludeBookingId?: string;
}

/**
 * Checks whether a room is free for the specified time slot.
 * Overlap formula: existing.startTime < requested.endTime AND existing.endTime > requested.startTime
 * Only applies to CONFIRMED bookings. Cancelled bookings do not block availability.
 * Adjacent bookings (existing.endTime === requested.startTime) do not overlap.
 */
export async function checkRoomAvailability({
  roomId,
  startTime,
  endTime,
  excludeBookingId,
}: CheckAvailabilityParams): Promise<{ isAvailable: boolean; conflictingBooking?: any }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, isActive: true, name: true, roomCode: true },
  });

  if (!room) {
    throw new NotFoundError("Conference room not found.");
  }

  if (!room.isActive) {
    throw new ValidationError(`Room '${room.name}' (${room.roomCode}) is deactivated and cannot be booked.`);
  }

  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      roomId,
      status: "CONFIRMED",
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      organizerName: true,
    },
  });

  return {
    isAvailable: !conflictingBooking,
    conflictingBooking: conflictingBooking || undefined,
  };
}

export interface CreateBookingParams {
  roomId: string;
  createdById: string;
  organizerName: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
}

/**
 * Creates a new booking using both application-level validation and database-level constraint handling.
 */
export async function createBooking(params: CreateBookingParams) {
  const { roomId, createdById, organizerName, title, description, startTime, endTime } = params;

  if (endTime.getTime() <= startTime.getTime()) {
    throw new ValidationError("End time must be strictly after start time.");
  }

  // Check room status and availability
  const availability = await checkRoomAvailability({
    roomId,
    startTime,
    endTime,
  });

  if (!availability.isAvailable) {
    throw new ConflictError(
      `Room is already booked from ${availability.conflictingBooking.startTime.toISOString()} to ${availability.conflictingBooking.endTime.toISOString()}.`
    );
  }

  try {
    // Perform database insertion.
    // Even under high-concurrency race conditions, the PostgreSQL exclusion constraint
    // or transactional isolation ensures no double bookings.
    return await prisma.$transaction(async (tx) => {
      // Re-verify inside transaction to minimize race window
      const overlap = await tx.booking.findFirst({
        where: {
          roomId,
          status: "CONFIRMED",
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (overlap) {
        throw new ConflictError("Room was just booked by another user for this time period.");
      }

      return await tx.booking.create({
        data: {
          roomId,
          createdById,
          organizerName,
          title,
          description: description || null,
          startTime,
          endTime,
          status: "CONFIRMED",
        },
        include: {
          room: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
  } catch (error: any) {
    // Catch database-level exclusion constraint violation or conflict
    if (
      error instanceof ConflictError ||
      error.code === "P2002" || // Prisma unique / exclusion violation
      (error.message && error.message.includes("exclusion")) ||
      (error.message && error.message.includes("no_overlapping_confirmed_bookings"))
    ) {
      throw new ConflictError(
        "A scheduling conflict occurred: This conference room is already reserved for the selected time slot."
      );
    }
    throw error;
  }
}

export interface UpdateBookingParams {
  id: string;
  roomId?: string;
  title?: string;
  description?: string | null;
  organizerName?: string;
  startTime?: Date;
  endTime?: Date;
  status?: "CONFIRMED" | "CANCELLED";
}

/**
 * Updates an existing booking with availability validation.
 */
export async function updateBooking(params: UpdateBookingParams) {
  const { id, ...updates } = params;

  const existing = await prisma.booking.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError("Booking not found.");
  }

  const targetRoomId = updates.roomId || existing.roomId;
  const targetStartTime = updates.startTime || existing.startTime;
  const targetEndTime = updates.endTime || existing.endTime;
  const targetStatus = updates.status || existing.status;

  if (targetEndTime.getTime() <= targetStartTime.getTime()) {
    throw new ValidationError("End time must be strictly after start time.");
  }

  // If the booking remains CONFIRMED and times/room are being updated, check availability
  if (targetStatus === "CONFIRMED") {
    const availability = await checkRoomAvailability({
      roomId: targetRoomId,
      startTime: targetStartTime,
      endTime: targetEndTime,
      excludeBookingId: id,
    });

    if (!availability.isAvailable) {
      throw new ConflictError(
        `Room conflict: Another booking exists from ${availability.conflictingBooking.startTime.toISOString()} to ${availability.conflictingBooking.endTime.toISOString()}.`
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (targetStatus === "CONFIRMED") {
        const overlap = await tx.booking.findFirst({
          where: {
            id: { not: id },
            roomId: targetRoomId,
            status: "CONFIRMED",
            startTime: { lt: targetEndTime },
            endTime: { gt: targetStartTime },
          },
        });

        if (overlap) {
          throw new ConflictError("Room scheduling conflict with an existing reservation.");
        }
      }

      return await tx.booking.update({
        where: { id },
        data: {
          roomId: updates.roomId,
          title: updates.title,
          description: updates.description,
          organizerName: updates.organizerName,
          startTime: updates.startTime,
          endTime: updates.endTime,
          status: updates.status,
          cancelledAt: updates.status === "CANCELLED" ? new Date() : undefined,
        },
        include: {
          room: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
  } catch (error: any) {
    if (
      error instanceof ConflictError ||
      error.code === "P2002" ||
      (error.message && error.message.includes("exclusion")) ||
      (error.message && error.message.includes("no_overlapping_confirmed_bookings"))
    ) {
      throw new ConflictError(
        "A scheduling conflict occurred: This conference room is already reserved for the selected time slot."
      );
    }
    throw error;
  }
}

/**
 * Cancels a booking while preserving its history.
 */
export async function cancelBooking(id: string) {
  const existing = await prisma.booking.findUnique({
    where: { id },
    include: {
      room: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError("Booking not found.");
  }

  if (existing.status === "CANCELLED") {
    return existing;
  }

  return await prisma.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
    include: {
      room: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}
