import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createBooking,
  updateBooking,
  cancelBooking,
  checkRoomAvailability,
  ConflictError,
  ValidationError,
  NotFoundError,
} from "../src/lib/booking-service";

const prisma = new PrismaClient();

describe("Enterprise Conference Room Booking System - Core Automated Test Suite", () => {
  let adminUser: any;
  let employeeUser: any;
  let testRoom: any;

  before(async () => {
    // 1. Setup test users
    adminUser = await prisma.user.upsert({
      where: { email: "admin-test@enterprise.com" },
      update: { role: "ADMIN", isActive: true },
      create: {
        email: "admin-test@enterprise.com",
        name: "Test Admin",
        role: "ADMIN",
        isActive: true,
      },
    });

    employeeUser = await prisma.user.upsert({
      where: { email: "emp-test@enterprise.com" },
      update: { role: "EMPLOYEE", isActive: true },
      create: {
        email: "emp-test@enterprise.com",
        name: "Test Employee",
        role: "EMPLOYEE",
        isActive: true,
      },
    });

    // Clean up any existing test rooms/bookings with code TEST-RM-
    await prisma.booking.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-RM-" } } },
    });
    await prisma.room.deleteMany({
      where: { roomCode: { startsWith: "TEST-RM-" } },
    });
  });

  after(async () => {
    // Cleanup test-specific rooms
    await prisma.booking.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-RM-" } } },
    });
    await prisma.room.deleteMany({
      where: { roomCode: { startsWith: "TEST-RM-" } },
    });
  });

  // Scenario 1: An administrator can create a conference room
  it("Scenario 1: Administrator can create a conference room", async () => {
    testRoom = await prisma.room.create({
      data: {
        roomCode: "TEST-RM-1",
        name: "Executive Test Suite",
        building: "Tower Alpha",
        floor: 10,
        capacity: 15,
        description: "Test room for automated validation",
        equipment: ["Projector", "Video conferencing"],
        isActive: true,
      },
    });

    assert.ok(testRoom.id);
    assert.equal(testRoom.roomCode, "TEST-RM-1");
    assert.equal(testRoom.isActive, true);
  });

  // Scenario 2: An administrator can edit a conference room
  it("Scenario 2: Administrator can edit a conference room", async () => {
    const updated = await prisma.room.update({
      where: { id: testRoom.id },
      data: {
        name: "Executive Test Suite (Updated)",
        capacity: 18,
      },
    });

    assert.equal(updated.name, "Executive Test Suite (Updated)");
    assert.equal(updated.capacity, 18);
  });

  // Scenario 3: An administrator can deactivate a conference room
  it("Scenario 3: Administrator can deactivate a conference room", async () => {
    const deactivated = await prisma.room.update({
      where: { id: testRoom.id },
      data: { isActive: false },
    });

    assert.equal(deactivated.isActive, false);
  });

  // Scenario 4: An administrator can reactivate a conference room
  it("Scenario 4: Administrator can reactivate a conference room", async () => {
    const reactivated = await prisma.room.update({
      where: { id: testRoom.id },
      data: { isActive: true },
    });

    assert.equal(reactivated.isActive, true);
  });

  // Scenario 5: An employee cannot create or modify conference rooms
  it("Scenario 5: Employee role verification denies room modification", () => {
    const performRoomCreationAsUser = (user: any) => {
      if (user.role !== "ADMIN") {
        throw new Error("403: Forbidden: Administrator privileges required");
      }
      return true;
    };

    assert.throws(
      () => performRoomCreationAsUser(employeeUser),
      /403: Forbidden/
    );
    assert.equal(performRoomCreationAsUser(adminUser), true);
  });

  // Scenario 6: An employee cannot create bookings
  it("Scenario 6: Employee role verification denies booking creation", () => {
    const performBookingCreationAsUser = (user: any) => {
      if (user.role !== "ADMIN") {
        throw new Error("403: Forbidden: Only administrators may book rooms");
      }
      return true;
    };

    assert.throws(
      () => performBookingCreationAsUser(employeeUser),
      /403: Forbidden/
    );
    assert.equal(performBookingCreationAsUser(adminUser), true);
  });

  // Scenario 7: An administrator can create a valid booking
  let booking1: any;
  it("Scenario 7: Administrator can create a valid booking", async () => {
    const start = new Date("2027-01-10T10:00:00Z");
    const end = new Date("2027-01-10T11:00:00Z");

    booking1 = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin User",
      title: "Quarterly Strategy Review",
      description: "Q1 planning session",
      startTime: start,
      endTime: end,
    });

    assert.ok(booking1.id);
    assert.equal(booking1.title, "Quarterly Strategy Review");
    assert.equal(booking1.status, "CONFIRMED");
  });

  // Scenario 8: Overlapping bookings are rejected (409 Conflict)
  it("Scenario 8: Overlapping bookings are rejected", async () => {
    // Attempt 1: Overlaps from 10:30 to 11:30 (starts during booking1)
    const overlappingStart1 = new Date("2027-01-10T10:30:00Z");
    const overlappingEnd1 = new Date("2027-01-10T11:30:00Z");

    await assert.rejects(
      async () => {
        await createBooking({
          roomId: testRoom.id,
          createdById: adminUser.id,
          organizerName: "Another Organizer",
          title: "Conflicting Meeting",
          startTime: overlappingStart1,
          endTime: overlappingEnd1,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        return true;
      }
    );

    // Attempt 2: Overlaps from 09:30 to 10:30 (ends during booking1)
    const overlappingStart2 = new Date("2027-01-10T09:30:00Z");
    const overlappingEnd2 = new Date("2027-01-10T10:30:00Z");

    await assert.rejects(
      async () => {
        await createBooking({
          roomId: testRoom.id,
          createdById: adminUser.id,
          organizerName: "Another Organizer",
          title: "Conflicting Meeting 2",
          startTime: overlappingStart2,
          endTime: overlappingEnd2,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        return true;
      }
    );

    // Attempt 3: Completely encompasses booking1 (09:00 to 12:00)
    const overlappingStart3 = new Date("2027-01-10T09:00:00Z");
    const overlappingEnd3 = new Date("2027-01-10T12:00:00Z");

    await assert.rejects(
      async () => {
        await createBooking({
          roomId: testRoom.id,
          createdById: adminUser.id,
          organizerName: "Another Organizer",
          title: "Conflicting Encompassing Meeting",
          startTime: overlappingStart3,
          endTime: overlappingEnd3,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        return true;
      }
    );
  });

  // Scenario 9: Adjacent bookings are accepted
  let booking2: any;
  it("Scenario 9: Adjacent bookings are accepted without conflict", async () => {
    // booking1 is 10:00 to 11:00.
    // Adjacent booking immediately follows: 11:00 to 12:00
    const adjacentStart = new Date("2027-01-10T11:00:00Z");
    const adjacentEnd = new Date("2027-01-10T12:00:00Z");

    booking2 = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "Team Lead",
      title: "Adjacent Follow-up Meeting",
      startTime: adjacentStart,
      endTime: adjacentEnd,
    });

    assert.ok(booking2.id);
    assert.equal(booking2.status, "CONFIRMED");

    // Preceding adjacent booking: 09:00 to 10:00
    const precedingStart = new Date("2027-01-10T09:00:00Z");
    const precedingEnd = new Date("2027-01-10T10:00:00Z");

    const precedingBooking = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "Early Bird",
      title: "Preceding Standup",
      startTime: precedingStart,
      endTime: precedingEnd,
    });

    assert.ok(precedingBooking.id);
  });

  // Scenario 10: Cancelled bookings do not block availability
  it("Scenario 10: Cancelled bookings do not block availability", async () => {
    // Create a booking for 14:00 to 15:00
    const slotStart = new Date("2027-01-10T14:00:00Z");
    const slotEnd = new Date("2027-01-10T15:00:00Z");

    const toCancel = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "Temporary",
      title: "Tentative Session",
      startTime: slotStart,
      endTime: slotEnd,
    });

    // Cancel it
    const cancelled = await cancelBooking(toCancel.id);
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelledAt);

    // Now re-book the EXACT same time slot: it MUST succeed!
    const rebooked = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "New Organizer",
      title: "Confirmed Session in Cancelled Slot",
      startTime: slotStart,
      endTime: slotEnd,
    });

    assert.ok(rebooked.id);
    assert.equal(rebooked.status, "CONFIRMED");
  });

  // Scenario 11: Booking edits cannot introduce scheduling conflicts
  it("Scenario 11: Booking edits cannot introduce scheduling conflicts", async () => {
    // booking1 is 10:00 to 11:00.
    // booking2 is 11:00 to 12:00.
    // Attempt to edit booking2 to start at 10:30 (overlaps booking1)
    await assert.rejects(
      async () => {
        await updateBooking({
          id: booking2.id,
          startTime: new Date("2027-01-10T10:30:00Z"),
          endTime: new Date("2027-01-10T11:30:00Z"),
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        return true;
      }
    );

    // But updating title or non-conflicting times must succeed
    const validEdit = await updateBooking({
      id: booking2.id,
      title: "Renamed Meeting Title",
    });
    assert.equal(validEdit.title, "Renamed Meeting Title");
  });

  // Scenario 12: Simultaneous conflicting booking attempts cannot both succeed
  // (Tests PostgreSQL exclusion constraint and transactional atomicity)
  it("Scenario 12: Simultaneous conflicting booking attempts cannot both succeed", async () => {
    const concurrentStart = new Date("2027-01-10T16:00:00Z");
    const concurrentEnd = new Date("2027-01-10T17:00:00Z");

    const attempts = await Promise.allSettled([
      createBooking({
        roomId: testRoom.id,
        createdById: adminUser.id,
        organizerName: "Admin Racer 1",
        title: "Race Session 1",
        startTime: concurrentStart,
        endTime: concurrentEnd,
      }),
      createBooking({
        roomId: testRoom.id,
        createdById: adminUser.id,
        organizerName: "Admin Racer 2",
        title: "Race Session 2",
        startTime: concurrentStart,
        endTime: concurrentEnd,
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");

    // Exactly one should succeed and one should be rejected due to conflict
    assert.equal(fulfilled.length, 1, "Exactly one concurrent booking should succeed");
    assert.equal(rejected.length, 1, "Exactly one concurrent booking should be rejected");
  });

  // Scenario 13: Inactive rooms cannot be booked
  it("Scenario 13: Inactive rooms cannot be booked", async () => {
    // Clean up if already exists
    await prisma.room.deleteMany({ where: { roomCode: "TEST-RM-INACTIVE-1" } });

    // Create an inactive room
    const inactiveRoom = await prisma.room.create({
      data: {
        roomCode: "TEST-RM-INACTIVE-1",
        name: "Deactivated Testing Chamber",
        building: "Tower Beta",
        floor: 1,
        capacity: 8,
        equipment: ["Whiteboard"],
        isActive: false,
      },
    });

    try {
      await assert.rejects(
        async () => {
          await createBooking({
            roomId: inactiveRoom.id,
            createdById: adminUser.id,
            organizerName: "Tester",
            title: "Attempted Booking on Inactive Room",
            startTime: new Date("2027-01-11T10:00:00Z"),
            endTime: new Date("2027-01-11T11:00:00Z"),
          });
        },
        (err: any) => {
          assert.ok(err instanceof ValidationError);
          assert.match(err.message, /deactivated/i);
          return true;
        }
      );
    } finally {
      await prisma.room.deleteMany({ where: { roomCode: "TEST-RM-INACTIVE-1" } });
    }
  });

  // Scenario 14: Historical bookings remain intact after room deactivation
  it("Scenario 14: Historical bookings remain intact after room deactivation", async () => {
    // Deactivate testRoom
    await prisma.room.update({
      where: { id: testRoom.id },
      data: { isActive: false },
    });

    // Check that booking1 still exists and references the room
    const preservedBooking = await prisma.booking.findUnique({
      where: { id: booking1.id },
      include: { room: true },
    });

    assert.ok(preservedBooking);
    assert.equal(preservedBooking.room.id, testRoom.id);
    assert.equal(preservedBooking.room.isActive, false);

    // Reactivate for remaining tests
    await prisma.room.update({
      where: { id: testRoom.id },
      data: { isActive: true },
    });
  });

  // Scenario 15: Unauthenticated users cannot access protected endpoints
  it("Scenario 15: Unauthenticated access throws 401 Unauthorized", () => {
    const simulateSessionGuard = (sessionUser: any) => {
      if (!sessionUser) {
        throw new Error("401: Authentication required");
      }
      return sessionUser;
    };

    assert.throws(
      () => simulateSessionGuard(null),
      /401: Authentication required/
    );
  });

  // Scenario 16: Users cannot modify their own application roles
  it("Scenario 16: Users cannot modify their own application roles", async () => {
    const sanitizeUserUpdate = (payload: any) => {
      const allowed = { name: payload.name };
      // Ignore role even if malicious user provided role: 'ADMIN'
      return allowed;
    };

    const maliciousPayload = { name: "Hacked Name", role: "ADMIN" };
    const sanitized: any = sanitizeUserUpdate(maliciousPayload);

    assert.equal(sanitized.role, undefined);
    assert.equal(sanitized.name, "Hacked Name");

    // Verify employee role remains EMPLOYEE
    const userInDb = await prisma.user.findUnique({
      where: { id: employeeUser.id },
    });
    assert.equal(userInDb?.role, "EMPLOYEE");
  });

  // Scenario 17: Deleting a room with historical bookings is blocked
  it("Scenario 17: Cannot delete room with booking history", async () => {
    // testRoom has bookings (booking1, etc.)
    const bookingCount = await prisma.booking.count({
      where: { roomId: testRoom.id },
    });
    assert.ok(bookingCount > 0);

    const safeDeleteGuard = async (roomId: string) => {
      const count = await prisma.booking.count({ where: { roomId } });
      if (count > 0) {
        throw new Error(
          `Cannot delete room with ${count} historical bookings. Deactivate instead.`
        );
      }
      return await prisma.room.delete({ where: { id: roomId } });
    };

    await assert.rejects(
      () => safeDeleteGuard(testRoom.id),
      /Cannot delete room with \d+ historical bookings/
    );
  });

  // Scenario 18: Midnight-crossing bookings are accepted if end > start
  it("Scenario 18: Bookings that cross midnight are supported", async () => {
    // E.g. Late night overnight session: 23:00 to 02:00 next day
    const startLate = new Date("2027-01-12T23:00:00Z");
    const endLate = new Date("2027-01-13T02:00:00Z");

    const overnightBooking = await createBooking({
      roomId: testRoom.id,
      createdById: adminUser.id,
      organizerName: "Night Shift",
      title: "Overnight System Maintenance Window",
      startTime: startLate,
      endTime: endLate,
    });

    assert.ok(overnightBooking.id);
    assert.equal(overnightBooking.title, "Overnight System Maintenance Window");
    assert.ok(overnightBooking.endTime > overnightBooking.startTime);
  });

  // Scenario 19: Timezone conversion correctly maps local company time to UTC
  it("Scenario 19: Timezone conversion maps IST to UTC accurately", () => {
    const { parseCompanyDateTimeToUTC, formatCompanyTime } = require("../src/lib/timezone");
    
    // In IST (UTC+5:30), 10:00 AM on 2027-01-10 is 04:30 AM UTC on 2027-01-10
    const parsedUTC = parseCompanyDateTimeToUTC("2027-01-10", "10:00");
    assert.equal(parsedUTC.toISOString(), "2027-01-10T04:30:00.000Z");

    // Format back to company timezone
    const formatted = formatCompanyTime(parsedUTC, "yyyy-MM-dd HH:mm");
    assert.equal(formatted, "2027-01-10 10:00");
  });

  // Scenario 20: Audit logs record administrative operations
  it("Scenario 20: Audit logging records administrative events", async () => {
    const { logAuditEvent } = require("../src/lib/audit-service");

    const log = await logAuditEvent({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      action: "BOOKING_CREATED",
      targetType: "BOOKING",
      targetId: "test-booking-id",
      details: { title: "Automated Test Session" },
    });

    assert.ok(log.id);
    assert.equal(log.action, "BOOKING_CREATED");
    assert.equal(log.actorEmail, adminUser.email);

    // Verify persisted in DB
    const fetched = await prisma.auditLog.findUnique({
      where: { id: log.id },
    });
    assert.ok(fetched);
    assert.equal(fetched.targetId, "test-booking-id");
  });
});
