import { prisma } from "./prisma";
import { UserSession, Role, ChatPendingAction } from "@/types";
import { COMPANY_TIMEZONE, parseCompanyDateTimeToUTC, formatCompanyDate } from "./timezone";
import { createBooking, checkRoomAvailability, ConflictError, ValidationError } from "./booking-service";
import { createBookingRequest } from "./booking-request-service";
import { addDays, format, parse, startOfWeek, addWeeks, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

export interface ChatProcessResult {
  reply: string;
  pendingAction: ChatPendingAction | null;
  actionExecuted?: "BOOKING_CREATED" | "BOOKING_REQUEST_CREATED" | "CANCELLED" | null;
  booking?: any;
  bookingRequest?: any;
}

/**
 * Normalizes and parses natural language time range expressions.
 * Implements strict rules:
 * - "5 to 6pm" => 17:00 to 18:00 ("pm" applies to both)
 * - "5 to 6am" => 05:00 to 06:00
 * - "5am to 6pm" => 05:00 to 18:00
 * - "17:00 to 18:00" => 17:00 to 18:00
 * - "5 PM to 6 PM" => 17:00 to 18:00
 */
export function parseTimeRange(input: string): { startTime: string; endTime: string } | null {
  const normalized = input.trim().toLowerCase();

  // Pattern: 17:00 to 18:00 or 17:00 - 18:00
  const twentyFourHourPattern = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:to|-)\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
  const match24 = normalized.match(twentyFourHourPattern);
  if (match24) {
    const startH = match24[1].padStart(2, "0");
    const startM = match24[2];
    const endH = match24[3].padStart(2, "0");
    const endM = match24[4];
    return {
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    };
  }

  // Pattern: 5(:00)?(am|pm)? to/- 6(:00)?(am|pm)?
  const standardPattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
  const matchStd = normalized.match(standardPattern);
  if (matchStd) {
    let startH = parseInt(matchStd[1], 10);
    const startM = matchStd[2] || "00";
    let startPeriod = matchStd[3]; // may be undefined
    let endH = parseInt(matchStd[4], 10);
    const endM = matchStd[5] || "00";
    const endPeriod = matchStd[6]; // am or pm

    // "The 'pm' applies to both times" rule: if start has no period, inherit from end
    if (!startPeriod) {
      startPeriod = endPeriod;
    }

    if (startPeriod === "pm" && startH < 12) startH += 12;
    if (startPeriod === "am" && startH === 12) startH = 0;

    if (endPeriod === "pm" && endH < 12) endH += 12;
    if (endPeriod === "am" && endH === 12) endH = 0;

    return {
      startTime: `${startH.toString().padStart(2, "0")}:${startM}`,
      endTime: `${endH.toString().padStart(2, "0")}:${endM}`,
    };
  }

  // Pattern where both periods are specified explicitly: e.g. "5pm to 6pm" or "5am to 6pm"
  const bothSpecifiedPattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
  const matchBoth = normalized.match(bothSpecifiedPattern);
  if (matchBoth) {
    let startH = parseInt(matchBoth[1], 10);
    const startM = matchBoth[2] || "00";
    const startPeriod = matchBoth[3];
    let endH = parseInt(matchBoth[4], 10);
    const endM = matchBoth[5] || "00";
    const endPeriod = matchBoth[6];

    if (startPeriod === "pm" && startH < 12) startH += 12;
    if (startPeriod === "am" && startH === 12) startH = 0;

    if (endPeriod === "pm" && endH < 12) endH += 12;
    if (endPeriod === "am" && endH === 12) endH = 0;

    return {
      startTime: `${startH.toString().padStart(2, "0")}:${startM}`,
      endTime: `${endH.toString().padStart(2, "0")}:${endM}`,
    };
  }

  return null;
}

/**
 * Resolves natural language date in the configured company timezone (Asia/Kolkata).
 * Handles: "today", "tomorrow", "day after tomorrow", "next Monday", "this Friday",
 * or explicit dates like "October 7, 2026", "2026-10-07".
 */
export function parseNaturalLanguageDate(input: string, referenceDate = new Date()): { dateStr: string; formattedDate: string } | null {
  const normalized = input.trim().toLowerCase();

  // Get current date string in Asia/Kolkata
  const todayStr = formatInTimeZone(referenceDate, COMPANY_TIMEZONE, "yyyy-MM-dd");
  const todayZoned = parse(todayStr, "yyyy-MM-dd", new Date());

  if (/\bday after tomorrow\b/.test(normalized)) {
    const target = addDays(todayZoned, 2);
    const dateStr = format(target, "yyyy-MM-dd");
    return {
      dateStr,
      formattedDate: format(target, "MMMM d, yyyy"),
    };
  }

  if (/\btomorrow\b/.test(normalized)) {
    const target = addDays(todayZoned, 1);
    const dateStr = format(target, "yyyy-MM-dd");
    return {
      dateStr,
      formattedDate: format(target, "MMMM d, yyyy"),
    };
  }

  if (/\btoday\b/.test(normalized)) {
    return {
      dateStr: todayStr,
      formattedDate: format(todayZoned, "MMMM d, yyyy"),
    };
  }

  // Weekdays: e.g. "next monday", "this friday", "on tuesday"
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdays.length; i++) {
    const dayName = weekdays[i];
    const regex = new RegExp(`\\b(next|this)?\\s*${dayName}\\b`, "i");
    const match = normalized.match(regex);
    if (match) {
      const isNext = match[1] === "next";
      const currentDayOfWeek = todayZoned.getDay();
      let daysAhead = i - currentDayOfWeek;
      if (daysAhead <= 0 || isNext) {
        daysAhead += 7;
      }
      const target = addDays(todayZoned, daysAhead);
      return {
        dateStr: format(target, "yyyy-MM-dd"),
        formattedDate: format(target, "MMMM d, yyyy"),
      };
    }
  }

  // Explicit ISO: YYYY-MM-DD
  const isoMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    try {
      const parsed = parse(isoMatch[1], "yyyy-MM-dd", new Date());
      return {
        dateStr: isoMatch[1],
        formattedDate: format(parsed, "MMMM d, yyyy"),
      };
    } catch {
      // continue
    }
  }

  // Explicit month day year: "October 7, 2026" or "Oct 7 2026" or "October 7th, 2026"
  const fullDateRegex = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s*(20\d{2})?\b/i;
  const fullDateMatch = input.match(fullDateRegex);
  if (fullDateMatch) {
    const month = fullDateMatch[1];
    const day = fullDateMatch[2].padStart(2, "0");
    const year = fullDateMatch[3] || todayStr.split("-")[0];
    const attemptStr = `${month} ${day} ${year}`;
    const parsed = new Date(Date.parse(attemptStr));
    if (!isNaN(parsed.getTime())) {
      return {
        dateStr: format(parsed, "yyyy-MM-dd"),
        formattedDate: format(parsed, "MMMM d, yyyy"),
      };
    }
  }

  return null;
}

/**
 * Searches for a room in the database using text matching.
 */
export async function resolveRoom(
  query: string,
  roomContextId?: string | null
): Promise<{ room: any; isAmbiguousContext?: boolean }> {
  const normalized = query.toLowerCase();

  // If user says "this room"
  if (/\b(this room|here|current room)\b/i.test(normalized)) {
    if (roomContextId) {
      const room = await prisma.room.findUnique({
        where: { id: roomContextId },
      });
      if (room) return { room };
    }
    // Ambiguous reference without known context
    return { room: null, isAmbiguousContext: true };
  }

  // Fetch all rooms from database
  const allRooms = await prisma.room.findMany();

  // 1. Exact match on roomCode
  const exactCode = allRooms.find((r) => r.roomCode.toLowerCase() === normalized);
  if (exactCode) return { room: exactCode };

  // 2. Exact match on room name
  const exactName = allRooms.find((r) => r.name.toLowerCase() === normalized);
  if (exactName) return { room: exactName };

  // 3. String contains name or roomCode
  for (const r of allRooms) {
    if (normalized.includes(r.name.toLowerCase()) || normalized.includes(r.roomCode.toLowerCase())) {
      return { room: r };
    }
  }

  // 4. Fuzzy match for phrases like "Conference Room A", "Room A", etc.
  for (const r of allRooms) {
    const simplifiedName = r.name.replace(/conference\s*room/i, "").trim().toLowerCase();
    const simplifiedQuery = normalized.replace(/conference\s*room/i, "").trim();
    if (simplifiedName && simplifiedQuery.includes(simplifiedName)) {
      return { room: r };
    }
  }

  return { room: null };
}

/**
 * Core Chatbot processor.
 * Never books immediately. Always presents structured confirmation and waits for explicit "yes".
 * Strictly respects role:
 * - Admin YES => creates confirmed Booking
 * - Employee YES => creates BookingRequest in PENDING state
 */
export async function processChatMessage(params: {
  message: string;
  user: UserSession;
  roomContextId?: string | null;
  pendingAction?: ChatPendingAction | null;
}): Promise<ChatProcessResult> {
  const { message, user, roomContextId, pendingAction } = params;
  const normalizedMsg = message.trim().toLowerCase();

  // -------------------------------------------------------------
  // 1. USER SAYS YES / CONFIRMS EXISTING PENDING ACTION
  // -------------------------------------------------------------
  const isYes = /^(yes|yes please|confirm|book it|send request|yes, book it|yes, send request|please book it|yes do it|proceed)$/i.test(normalizedMsg);

  if (isYes) {
    if (!pendingAction) {
      return {
        reply: "There is no pending booking request to confirm. Please tell me which room, date, and time you would like to book.",
        pendingAction: null,
      };
    }

    // Verify ownership of the pending action
    if (pendingAction.userId !== user.id) {
      return {
        reply: "Security validation error: The pending booking belongs to another session. Please start a new request.",
        pendingAction: null,
      };
    }

    const startUTC = new Date(pendingAction.startUTC);
    const endUTC = new Date(pendingAction.endUTC);

    // Re-check room active status
    const room = await prisma.room.findUnique({
      where: { id: pendingAction.roomId },
    });

    if (!room || !room.isActive) {
      return {
        reply: `${pendingAction.roomName} is currently inactive and cannot be booked.`,
        pendingAction: null,
      };
    }

    // Re-check room availability right before creating
    const availability = await checkRoomAvailability({
      roomId: pendingAction.roomId,
      startTime: startUTC,
      endTime: endUTC,
    });

    if (!availability.isAvailable) {
      return {
        reply: `${pendingAction.roomName} is not available on ${pendingAction.formattedDate} from ${pendingAction.startTime} to ${pendingAction.endTime}. Another reservation has taken this slot.`,
        pendingAction: null,
      };
    }

    // ROLE DECISION:
    // ADMIN => create Booking directly
    // EMPLOYEE => create BookingRequest (NEVER a confirmed Booking)
    if (user.role === "ADMIN") {
      const booking = await createBooking({
        roomId: pendingAction.roomId,
        createdById: user.id,
        organizerName: user.name,
        title: pendingAction.title || "Executive Meeting",
        description: pendingAction.description || null,
        startTime: startUTC,
        endTime: endUTC,
      });

      return {
        reply: `Booking confirmed. ${pendingAction.roomName} is booked for ${pendingAction.formattedDate} from ${pendingAction.startTime} to ${pendingAction.endTime}.`,
        pendingAction: null,
        actionExecuted: "BOOKING_CREATED",
        booking,
      };
    } else {
      // Employee flow
      const bookingRequest = await createBookingRequest({
        requesterId: user.id,
        roomId: pendingAction.roomId,
        title: pendingAction.title || "Team Collaboration Meeting",
        description: pendingAction.description || null,
        startTime: startUTC,
        endTime: endUTC,
      });

      return {
        reply: "Your booking request has been sent to an administrator. You will be notified once it is approved or rejected.",
        pendingAction: null,
        actionExecuted: "BOOKING_REQUEST_CREATED",
        bookingRequest,
      };
    }
  }

  // -------------------------------------------------------------
  // 2. USER SAYS NO / CANCEL
  // -------------------------------------------------------------
  const isNo = /^(no|cancel|don't book it|dont book it|never mind|nevermind|no don't|stop)$/i.test(normalizedMsg);

  if (isNo) {
    if (pendingAction) {
      return {
        reply: "Okay, I won't create the booking.",
        pendingAction: null,
        actionExecuted: "CANCELLED",
      };
    }
    return {
      reply: "Understood. Let me know whenever you need to check availability or schedule a conference room.",
      pendingAction: null,
    };
  }

  // -------------------------------------------------------------
  // 3. USER CORRECTS AN EXISTING PENDING ACTION (e.g. "No, I meant 5am to 6pm")
  // -------------------------------------------------------------
  const isCorrection = pendingAction && (/meant|actually|change|instead|make it/i.test(normalizedMsg) || parseTimeRange(message));

  if (isCorrection && pendingAction) {
    const newTimes = parseTimeRange(message);
    const newDate = parseNaturalLanguageDate(message);

    const targetDateStr = newDate ? newDate.dateStr : pendingAction.date;
    const targetFormattedDate = newDate ? newDate.formattedDate : pendingAction.formattedDate;
    const targetStartTime = newTimes ? newTimes.startTime : pendingAction.startTime;
    const targetEndTime = newTimes ? newTimes.endTime : pendingAction.endTime;

    // Validate start < end
    const startUTC = parseCompanyDateTimeToUTC(targetDateStr, targetStartTime);
    const endUTC = parseCompanyDateTimeToUTC(targetDateStr, targetEndTime);

    if (endUTC.getTime() <= startUTC.getTime()) {
      return {
        reply: "The end time must be after the start time.",
        pendingAction,
      };
    }

    // Re-check room availability with corrected times
    const room = await prisma.room.findUnique({
      where: { id: pendingAction.roomId },
    });

    if (!room || !room.isActive) {
      return {
        reply: `${pendingAction.roomName} is currently inactive and cannot be booked.`,
        pendingAction: null,
      };
    }

    const availability = await checkRoomAvailability({
      roomId: pendingAction.roomId,
      startTime: startUTC,
      endTime: endUTC,
    });

    if (!availability.isAvailable) {
      return {
        reply: `${pendingAction.roomName} is not available on ${targetFormattedDate} from ${targetStartTime} to ${targetEndTime}.`,
        pendingAction,
      };
    }

    const updatedPendingAction: ChatPendingAction = {
      ...pendingAction,
      date: targetDateStr,
      formattedDate: targetFormattedDate,
      startTime: targetStartTime,
      endTime: targetEndTime,
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString(),
    };

    // Format new complete confirmation
    const confirmationText =
      user.role === "ADMIN"
        ? `${pendingAction.roomName} is available on ${targetFormattedDate} from ${targetStartTime} to ${targetEndTime}. Would you like me to book it?`
        : `${pendingAction.roomName} is available on ${targetFormattedDate} from ${targetStartTime} to ${targetEndTime}. Would you like me to send this booking request to an administrator?`;

    return {
      reply: confirmationText,
      pendingAction: updatedPendingAction,
    };
  }

  // -------------------------------------------------------------
  // 4. NEW BOOKING / AVAILABILITY REQUEST INTERPRETATION
  // -------------------------------------------------------------
  const times = parseTimeRange(message);
  const dateInfo = parseNaturalLanguageDate(message);
  const { room, isAmbiguousContext } = await resolveRoom(message, roomContextId);

  // If user said "this room" but context is missing
  if (isAmbiguousContext) {
    return {
      reply: "Which conference room would you like to book? Please specify the room name or code.",
      pendingAction: null,
    };
  }

  // If user mentioned booking/checking without a valid room
  const isBookingIntent = /book|schedule|reserve|reserve a room|need a room|meeting|availability/i.test(normalizedMsg);

  if (isBookingIntent && !room) {
    // If user specified times/dates but didn't name a valid room
    return {
      reply: "I couldn't find that conference room. Please specify a valid room.",
      pendingAction: null,
    };
  }

  if (!room) {
    return {
      reply: "I can help you check room availability and book conference rooms. Try saying: 'Book Conference Room A from 5 to 6pm tomorrow.'",
      pendingAction: null,
    };
  }

  // Room found: check if active
  if (!room.isActive) {
    return {
      reply: `${room.name} is currently inactive and cannot be booked.`,
      pendingAction: null,
    };
  }

  // Check for missing date
  if (!dateInfo) {
    return {
      reply: `What date would you like to book ${room.name}?`,
      pendingAction: null,
    };
  }

  // Check for missing start/end times
  if (!times) {
    return {
      reply: "Please provide a valid start and end time (for example, from 5 to 6pm or 17:00 to 18:00).",
      pendingAction: null,
    };
  }

  // Convert to UTC dates in company timezone
  const startUTC = parseCompanyDateTimeToUTC(dateInfo.dateStr, times.startTime);
  const endUTC = parseCompanyDateTimeToUTC(dateInfo.dateStr, times.endTime);

  if (endUTC.getTime() <= startUTC.getTime()) {
    return {
      reply: "The end time must be after the start time.",
      pendingAction: null,
    };
  }

  // Check availability in database
  const availability = await checkRoomAvailability({
    roomId: room.id,
    startTime: startUTC,
    endTime: endUTC,
  });

  if (!availability.isAvailable) {
    return {
      reply: `${room.name} is not available on ${dateInfo.formattedDate} from ${times.startTime} to ${times.endTime}.`,
      pendingAction: null,
    };
  }

  // Construct structured pending action
  const newPendingAction: ChatPendingAction = {
    roomId: room.id,
    roomName: room.name,
    roomCode: room.roomCode,
    date: dateInfo.dateStr,
    formattedDate: dateInfo.formattedDate,
    startTime: times.startTime,
    endTime: times.endTime,
    title: `${user.name}'s Meeting`,
    description: null,
    userId: user.id,
    userRole: user.role,
    startUTC: startUTC.toISOString(),
    endUTC: endUTC.toISOString(),
    confirmationRequired: true,
  };

  // Construct complete confirmation format with room, full date, 24h start/end time
  const confirmationText =
    user.role === "ADMIN"
      ? `${room.name} is available on ${dateInfo.formattedDate} from ${times.startTime} to ${times.endTime}. Would you like me to book it?`
      : `${room.name} is available on ${dateInfo.formattedDate} from ${times.startTime} to ${times.endTime}. Would you like me to send this booking request to an administrator?`;

  return {
    reply: confirmationText,
    pendingAction: newPendingAction,
  };
}
