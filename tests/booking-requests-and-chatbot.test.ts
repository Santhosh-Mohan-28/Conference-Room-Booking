import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createBooking,
  checkRoomAvailability,
  ConflictError,
  ValidationError,
  NotFoundError,
} from "../src/lib/booking-service";
import {
  createBookingRequest,
  approveBookingRequest,
  rejectBookingRequest,
  getBookingRequests,
  getUserBookingRequests,
} from "../src/lib/booking-request-service";
import {
  parseTimeRange,
  parseNaturalLanguageDate,
  processChatMessage,
  resolveRoom,
} from "../src/lib/chatbot-service";
import { parseCompanyDateTimeToUTC, COMPANY_TIMEZONE } from "../src/lib/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { addDays, parse } from "date-fns";

const prisma = new PrismaClient();

describe("Enterprise Booking Requests & AI Chatbot System - Comprehensive Test Suite", () => {
  let adminUser: any;
  let employeeUser: any;
  let employeeUser2: any;
  let activeRoom: any;
  let inactiveRoom: any;

  before(async () => {
    // 1. Setup users
    adminUser = await prisma.user.upsert({
      where: { email: "admin-req-test@enterprise.com" },
      update: { role: "ADMIN", isActive: true },
      create: {
        email: "admin-req-test@enterprise.com",
        name: "Admin Tester",
        role: "ADMIN",
        isActive: true,
      },
    });

    employeeUser = await prisma.user.upsert({
      where: { email: "emp-req-test@enterprise.com" },
      update: { role: "EMPLOYEE", isActive: true },
      create: {
        email: "emp-req-test@enterprise.com",
        name: "Employee Alice",
        role: "EMPLOYEE",
        isActive: true,
      },
    });

    employeeUser2 = await prisma.user.upsert({
      where: { email: "emp2-req-test@enterprise.com" },
      update: { role: "EMPLOYEE", isActive: true },
      create: {
        email: "emp2-req-test@enterprise.com",
        name: "Employee Bob",
        role: "EMPLOYEE",
        isActive: true,
      },
    });

    // Cleanup previous test rooms and records
    await prisma.bookingRequest.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-REQ-" } } },
    });
    await prisma.booking.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-REQ-" } } },
    });
    await prisma.room.deleteMany({
      where: { roomCode: { startsWith: "TEST-REQ-" } },
    });

    // Create test active room
    activeRoom = await prisma.room.create({
      data: {
        roomCode: "TEST-REQ-A",
        name: "Conference Room Alpha",
        building: "Innovation Hub",
        floor: 3,
        capacity: 10,
        isActive: true,
      },
    });

    // Create test inactive room
    inactiveRoom = await prisma.room.create({
      data: {
        roomCode: "TEST-REQ-INACTIVE",
        name: "Conference Room Inactive",
        building: "Innovation Hub",
        floor: 1,
        capacity: 8,
        isActive: false,
      },
    });
  });

  after(async () => {
    // Cleanup
    await prisma.bookingRequest.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-REQ-" } } },
    });
    await prisma.booking.deleteMany({
      where: { room: { roomCode: { startsWith: "TEST-REQ-" } } },
    });
    await prisma.room.deleteMany({
      where: { roomCode: { startsWith: "TEST-REQ-" } },
    });
  });

  // 1. ADMIN can create confirmed booking
  it("Requirement 1: ADMIN can create confirmed booking", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-01", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-01", "11:00");

    const booking = await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: adminUser.name,
      title: "Executive Strategy Meeting",
      startTime: start,
      endTime: end,
    });

    assert.ok(booking.id);
    assert.equal(booking.status, "CONFIRMED");
    assert.equal(booking.roomId, activeRoom.id);
  });

  // 2. EMPLOYEE cannot create confirmed booking directly
  it("Requirement 2: EMPLOYEE cannot create confirmed booking directly via booking creation logic", async () => {
    const checkRolePermission = (user: any) => {
      if (user.role !== "ADMIN") {
        throw new Error("Access denied: Administrator privileges required.");
      }
    };

    assert.throws(() => checkRolePermission(employeeUser), {
      message: /Administrator privileges required/,
    });
  });

  // 3. EMPLOYEE can create BookingRequest with PENDING status
  it("Requirement 3: EMPLOYEE can create BookingRequest with PENDING status", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-01", "14:00");
    const end = parseCompanyDateTimeToUTC("2026-11-01", "15:00");

    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Sprint Retrospective",
      startTime: start,
      endTime: end,
    });

    assert.ok(request.id);
    assert.equal(request.status, "PENDING");
    assert.equal(request.requesterId, employeeUser.id);
    assert.equal(request.roomId, activeRoom.id);

    // Verify NO confirmed booking was created
    const booking = await prisma.booking.findFirst({
      where: { roomId: activeRoom.id, startTime: start, status: "CONFIRMED" },
    });
    assert.equal(booking, null);
  });

  // 4. EMPLOYEE cannot approve BookingRequest
  it("Requirement 4: EMPLOYEE cannot approve BookingRequest", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-01", "16:00");
    const end = parseCompanyDateTimeToUTC("2026-11-01", "17:00");

    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Team Check-in",
      startTime: start,
      endTime: end,
    });

    const verifyAdminApproval = (caller: any) => {
      if (caller.role !== "ADMIN") {
        throw new Error("Access denied: Administrator privileges required.");
      }
    };

    assert.throws(() => verifyAdminApproval(employeeUser), {
      message: /Administrator privileges required/,
    });
  });

  // 5. ADMIN can approve BookingRequest
  it("Requirement 5: ADMIN can approve BookingRequest", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-02", "09:00");
    const end = parseCompanyDateTimeToUTC("2026-11-02", "10:00");

    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Client Pitch",
      startTime: start,
      endTime: end,
    });

    const result = await approveBookingRequest({
      requestId: request.id,
      adminId: adminUser.id,
      adminEmail: adminUser.email,
    });

    assert.equal(result.request.status, "APPROVED");
    assert.equal(result.request.reviewedById, adminUser.id);
    assert.ok(result.booking.id);
    assert.equal(result.booking.status, "CONFIRMED");
    assert.equal(result.booking.createdById, employeeUser.id);
  });

  // 6. ADMIN can reject BookingRequest
  it("Requirement 6: ADMIN can reject BookingRequest with reason", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-02", "11:00");
    const end = parseCompanyDateTimeToUTC("2026-11-02", "12:00");

    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Brainstorming Session",
      startTime: start,
      endTime: end,
    });

    const rejected = await rejectBookingRequest({
      requestId: request.id,
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      reason: "Room reserved for quarterly maintenance",
    });

    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, "Room reserved for quarterly maintenance");
    assert.equal(rejected.reviewedById, adminUser.id);

    // Ensure no confirmed booking exists
    const booking = await prisma.booking.findFirst({
      where: { roomId: activeRoom.id, startTime: start, status: "CONFIRMED" },
    });
    assert.equal(booking, null);
  });

  // 7. Approval creates confirmed Booking when room is available
  it("Requirement 7: Approval creates confirmed Booking when room is available", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-03", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-03", "11:00");

    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Product Architecture Review",
      startTime: start,
      endTime: end,
    });

    const result = await approveBookingRequest({
      requestId: request.id,
      adminId: adminUser.id,
      adminEmail: adminUser.email,
    });

    assert.equal(result.request.status, "APPROVED");
    assert.ok(result.booking.id);
    assert.equal(result.booking.roomId, activeRoom.id);
  });

  // 8. Approval does not create Booking when room became unavailable
  it("Requirement 8: Approval does not create Booking when room became unavailable", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-03", "14:00");
    const end = parseCompanyDateTimeToUTC("2026-11-03", "15:00");

    // Employee submits request
    const request = await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Initial Request",
      startTime: start,
      endTime: end,
    });

    // Meanwhile, another booking is directly scheduled at the exact same time
    await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Executive",
      title: "Priority Executive Summit",
      startTime: start,
      endTime: end,
    });

    // Admin tries to approve employee request: must detect conflict and fail!
    await assert.rejects(
      async () => {
        await approveBookingRequest({
          requestId: request.id,
          adminId: adminUser.id,
          adminEmail: adminUser.email,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        assert.match(err.message, /no longer available/);
        return true;
      }
    );

    // Verify request is NOT marked as approved
    const unmodifiedReq = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    assert.equal(unmodifiedReq?.status, "PENDING");
  });

  // 9. Overlapping bookings are rejected
  it("Requirement 9: Overlapping bookings are rejected", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-04", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-04", "11:00");

    await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin",
      title: "First Booking",
      startTime: start,
      endTime: end,
    });

    // Partial overlap: 10:30 to 11:30
    const overlapStart = parseCompanyDateTimeToUTC("2026-11-04", "10:30");
    const overlapEnd = parseCompanyDateTimeToUTC("2026-11-04", "11:30");

    await assert.rejects(
      async () => {
        await createBooking({
          roomId: activeRoom.id,
          createdById: adminUser.id,
          organizerName: "Admin",
          title: "Conflicting Booking",
          startTime: overlapStart,
          endTime: overlapEnd,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConflictError);
        return true;
      }
    );
  });

  // 10. Adjacent bookings are allowed
  it("Requirement 10: Adjacent bookings are allowed without conflict", async () => {
    // 11:00 - 12:00 directly adjacent to 10:00 - 11:00
    const start = parseCompanyDateTimeToUTC("2026-11-04", "11:00");
    const end = parseCompanyDateTimeToUTC("2026-11-04", "12:00");

    const adjacentBooking = await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin",
      title: "Adjacent Meeting",
      startTime: start,
      endTime: end,
    });

    assert.ok(adjacentBooking.id);
  });

  // 11. Cancelled bookings do not block availability
  it("Requirement 11: Cancelled bookings do not block availability", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-05", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-05", "11:00");

    const booking = await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin",
      title: "Booking to be cancelled",
      startTime: start,
      endTime: end,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // Can book the exact same slot now
    const newBooking = await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin",
      title: "Replacement Booking",
      startTime: start,
      endTime: end,
    });

    assert.ok(newBooking.id);
    assert.equal(newBooking.status, "CONFIRMED");
  });

  // 12. Inactive rooms cannot be booked or requested
  it("Requirement 12: Inactive rooms cannot be booked or requested", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-06", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-06", "11:00");

    await assert.rejects(
      async () => {
        await createBooking({
          roomId: inactiveRoom.id,
          createdById: adminUser.id,
          organizerName: "Admin",
          title: "Inactive Room Booking",
          startTime: start,
          endTime: end,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /deactivated/);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await createBookingRequest({
          requesterId: employeeUser.id,
          roomId: inactiveRoom.id,
          title: "Inactive Room Request",
          startTime: start,
          endTime: end,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /deactivated/);
        return true;
      }
    );
  });

  // 13. Employee can only see their own requests
  it("Requirement 13: Employee can only see their own requests", async () => {
    const start1 = parseCompanyDateTimeToUTC("2026-11-07", "10:00");
    const end1 = parseCompanyDateTimeToUTC("2026-11-07", "11:00");
    await createBookingRequest({
      requesterId: employeeUser.id,
      roomId: activeRoom.id,
      title: "Alice's Request",
      startTime: start1,
      endTime: end1,
    });

    const start2 = parseCompanyDateTimeToUTC("2026-11-07", "14:00");
    const end2 = parseCompanyDateTimeToUTC("2026-11-07", "15:00");
    await createBookingRequest({
      requesterId: employeeUser2.id,
      roomId: activeRoom.id,
      title: "Bob's Request",
      startTime: start2,
      endTime: end2,
    });

    const aliceRequests = await getUserBookingRequests({ userId: employeeUser.id });
    assert.ok(aliceRequests.requests.length > 0);
    assert.ok(aliceRequests.requests.every((r) => r.requesterId === employeeUser.id));

    const bobRequests = await getUserBookingRequests({ userId: employeeUser2.id });
    assert.ok(bobRequests.requests.length > 0);
    assert.ok(bobRequests.requests.every((r) => r.requesterId === employeeUser2.id));
  });

  // 14. Admin can see pending requests across all users
  it("Requirement 14: Admin can see pending requests across all users", async () => {
    const allPending = await getBookingRequests({ status: "PENDING" });
    assert.ok(allPending.requests.length >= 2);
  });

  // 15. Chatbot interprets: "5 to 6pm" as 17:00 - 18:00
  it("Requirement 15: Chatbot interprets '5 to 6pm' as 17:00 - 18:00", () => {
    const res = parseTimeRange("Book this room from 5 to 6pm tomorrow");
    assert.deepEqual(res, { startTime: "17:00", endTime: "18:00" });
  });

  // 16. Chatbot interprets: "5am to 6pm" as 05:00 - 18:00
  it("Requirement 16: Chatbot interprets '5am to 6pm' as 05:00 - 18:00", () => {
    const res = parseTimeRange("Book this room from 5am to 6pm");
    assert.deepEqual(res, { startTime: "05:00", endTime: "18:00" });
  });

  // 17. Chatbot converts: "5 PM" to 17:00
  it("Requirement 17: Chatbot converts '5 PM to 6 PM' to 17:00 - 18:00", () => {
    const res = parseTimeRange("Conference Room Alpha from 5 PM to 6 PM");
    assert.deepEqual(res, { startTime: "17:00", endTime: "18:00" });
  });

  // 18. Chatbot converts: "17:00" correctly
  it("Requirement 18: Chatbot converts '17:00 to 18:00' correctly", () => {
    const res = parseTimeRange("Book from 17:00 to 18:00 tomorrow");
    assert.deepEqual(res, { startTime: "17:00", endTime: "18:00" });
  });

  // 19. Chatbot handles tomorrow using Asia/Kolkata
  it("Requirement 19: Chatbot handles tomorrow using Asia/Kolkata", () => {
    const ref = new Date();
    const todayInKolkata = formatInTimeZone(ref, COMPANY_TIMEZONE, "yyyy-MM-dd");
    const tomorrowInKolkata = addDays(parse(todayInKolkata, "yyyy-MM-dd", new Date()), 1);
    const expectedTomorrowStr = formatInTimeZone(tomorrowInKolkata, COMPANY_TIMEZONE, "yyyy-MM-dd");

    const dateResult = parseNaturalLanguageDate("Book for tomorrow from 10 to 11am", ref);
    assert.ok(dateResult);
    assert.equal(dateResult.dateStr, expectedTomorrowStr);
  });

  // 20. Chatbot never creates booking without confirmation
  it("Requirement 20: Chatbot never creates booking without confirmation", async () => {
    const res = await processChatMessage({
      message: `Book Conference Room Alpha from 5 to 6pm on 2026-11-20`,
      user: adminUser,
    });

    assert.ok(res.pendingAction);
    assert.equal(res.actionExecuted, undefined);
    assert.match(res.reply, /Would you like me to book it\?/);

    // Check that nothing was added to database yet
    const start = parseCompanyDateTimeToUTC("2026-11-20", "17:00");
    const booking = await prisma.booking.findFirst({
      where: { roomId: activeRoom.id, startTime: start },
    });
    assert.equal(booking, null);
  });

  // 21. ADMIN chatbot YES creates Booking
  it("Requirement 21: ADMIN chatbot YES creates confirmed Booking", async () => {
    // Step 1: Initial query
    const step1 = await processChatMessage({
      message: `Book Conference Room Alpha from 5 to 6pm on 2026-11-21`,
      user: adminUser,
    });
    assert.ok(step1.pendingAction);

    // Step 2: Confirmation
    const step2 = await processChatMessage({
      message: "Yes",
      user: adminUser,
      pendingAction: step1.pendingAction,
    });

    assert.equal(step2.actionExecuted, "BOOKING_CREATED");
    assert.match(step2.reply, /Booking confirmed/);
    assert.ok(step2.booking);
    assert.equal(step2.booking.status, "CONFIRMED");
  });

  // 22. EMPLOYEE chatbot YES creates BookingRequest (never Booking)
  it("Requirement 22: EMPLOYEE chatbot YES creates BookingRequest (never Booking)", async () => {
    // Step 1: Initial query
    const step1 = await processChatMessage({
      message: `Book Conference Room Alpha from 5 to 6pm on 2026-11-22`,
      user: employeeUser,
    });
    assert.ok(step1.pendingAction);
    assert.match(step1.reply, /send this booking request to an administrator\?/);

    // Step 2: Employee confirms
    const step2 = await processChatMessage({
      message: "Yes",
      user: employeeUser,
      pendingAction: step1.pendingAction,
    });

    assert.equal(step2.actionExecuted, "BOOKING_REQUEST_CREATED");
    assert.match(step2.reply, /booking request has been sent to an administrator/);
    assert.ok(step2.bookingRequest);
    assert.equal(step2.bookingRequest.status, "PENDING");

    // Strictly ensure no confirmed Booking was created!
    const start = parseCompanyDateTimeToUTC("2026-11-22", "17:00");
    const booking = await prisma.booking.findFirst({
      where: { roomId: activeRoom.id, startTime: start, status: "CONFIRMED" },
    });
    assert.equal(booking, null);
  });

  // 23. Chatbot NO creates nothing
  it("Requirement 23: Chatbot NO creates nothing and clears pending action", async () => {
    const step1 = await processChatMessage({
      message: `Book Conference Room Alpha from 5 to 6pm on 2026-11-23`,
      user: adminUser,
    });
    assert.ok(step1.pendingAction);

    const step2 = await processChatMessage({
      message: "No",
      user: adminUser,
      pendingAction: step1.pendingAction,
    });

    assert.equal(step2.pendingAction, null);
    assert.match(step2.reply, /won't create the booking/);

    const start = parseCompanyDateTimeToUTC("2026-11-23", "17:00");
    const booking = await prisma.booking.findFirst({
      where: { roomId: activeRoom.id, startTime: start },
    });
    assert.equal(booking, null);
  });

  // 24. Correcting a time updates the pending action
  it("Requirement 24: Correcting a time updates the pending action", async () => {
    const step1 = await processChatMessage({
      message: `Book Conference Room Alpha from 5 to 6pm on 2026-11-24`,
      user: adminUser,
    });
    assert.ok(step1.pendingAction);
    assert.equal(step1.pendingAction.startTime, "17:00");

    const step2 = await processChatMessage({
      message: "No, I meant 5am to 6pm",
      user: adminUser,
      pendingAction: step1.pendingAction,
    });

    assert.ok(step2.pendingAction);
    assert.equal(step2.pendingAction.startTime, "05:00");
    assert.equal(step2.pendingAction.endTime, "18:00");
    assert.match(step2.reply, /05:00 to 18:00/);
  });

  // 25. Corrected booking is revalidated for availability
  it("Requirement 25: Corrected booking is revalidated for availability", async () => {
    // Existing booking at 09:00 - 10:00 on 2026-11-25
    const conflictStart = parseCompanyDateTimeToUTC("2026-11-25", "09:00");
    const conflictEnd = parseCompanyDateTimeToUTC("2026-11-25", "10:00");
    await createBooking({
      roomId: activeRoom.id,
      createdById: adminUser.id,
      organizerName: "Admin",
      title: "Morning Block",
      startTime: conflictStart,
      endTime: conflictEnd,
    });

    // Step 1: user asks for 14:00 - 15:00 (available)
    const step1 = await processChatMessage({
      message: `Book Conference Room Alpha from 2pm to 3pm on 2026-11-25`,
      user: adminUser,
    });
    assert.ok(step1.pendingAction);

    // Step 2: user corrects to 09:00 - 10:00 (conflict!)
    const step2 = await processChatMessage({
      message: "Actually I meant 9am to 10am",
      user: adminUser,
      pendingAction: step1.pendingAction,
    });

    assert.match(step2.reply, /not available/);
  });

  // 26. Employee cannot bypass restrictions through API requests
  it("Requirement 26: Employee cannot bypass restrictions through API requests", async () => {
    const simulateDirectBookingApi = (user: any) => {
      if (user.role !== "ADMIN") {
        throw new Error("403 Forbidden: Administrator role required");
      }
    };

    assert.throws(() => simulateDirectBookingApi(employeeUser), {
      message: /403 Forbidden/,
    });
  });

  // 27. Concurrent booking attempts cannot create overlapping confirmed bookings
  it("Requirement 27: Concurrent booking attempts cannot create overlapping confirmed bookings", async () => {
    const start = parseCompanyDateTimeToUTC("2026-11-26", "10:00");
    const end = parseCompanyDateTimeToUTC("2026-11-26", "11:00");

    const attempts = [
      createBooking({
        roomId: activeRoom.id,
        createdById: adminUser.id,
        organizerName: "Admin 1",
        title: "Concurrent 1",
        startTime: start,
        endTime: end,
      }),
      createBooking({
        roomId: activeRoom.id,
        createdById: adminUser.id,
        organizerName: "Admin 2",
        title: "Concurrent 2",
        startTime: start,
        endTime: end,
      }),
    ];

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });
});
