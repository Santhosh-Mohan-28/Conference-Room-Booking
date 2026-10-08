import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";
import { UserSession, ChatPendingAction } from "@/types";
import {
  COMPANY_TIMEZONE,
  parseCompanyDateTimeToUTC,
} from "./timezone";
import {
  createBooking,
  checkRoomAvailability,
} from "./booking-service";
import { createBookingRequest } from "./booking-request-service";
import {
  addDays,
  format,
  parse,
} from "date-fns";
import {
  formatInTimeZone,
} from "date-fns-tz";

export interface ChatProcessResult {
  reply: string;
  pendingAction: ChatPendingAction | null;
  actionExecuted?:
    | "BOOKING_CREATED"
    | "BOOKING_REQUEST_CREATED"
    | "CANCELLED"
    | null;
  booking?: any;
  bookingRequest?: any;
}

type ChatIntent =
  | "GENERAL"
  | "CHECK_AVAILABILITY"
  | "GET_SCHEDULE"
  | "BOOK"
  | "CANCEL_BOOKING"
  | "MY_BOOKINGS"
  | "MY_REQUESTS"
  | "ROOM_INFO"
  | "HELP";

interface GeminiIntent {
  intent: ChatIntent;
  roomQuery?: string | null;
  dateExpression?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  title?: string | null;
  description?: string | null;
  query?: string | null;
}

interface RoomData {
  id: string;
  roomCode: string;
  name: string;
  building: string;
  floor: number;
  capacity: number;
  description: string | null;
  equipment: string[];
  isActive: boolean;
}

interface ScheduleBooking {
  id: string;
  title: string;
  organizerName: string;
  startTime: Date;
  endTime: Date;
  status: string;
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

/**
 * Parse a time range deterministically.
 *
 * Important examples:
 * 5 to 6pm       -> 17:00 - 18:00
 * 5pm to 6pm     -> 17:00 - 18:00
 * 5am to 6pm     -> 05:00 - 18:00
 * 11 to 1pm      -> 11:00 - 13:00
 * 11am to 1pm    -> 11:00 - 13:00
 * 17:00 to 18:00 -> 17:00 - 18:00
 */
export function parseTimeRange(
  input: string
): { startTime: string; endTime: string } | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  const twentyFourHourPattern =
    /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:to|-)\s*([01]?\d|2[0-3]):([0-5]\d)\b/;

  const match24 = normalized.match(twentyFourHourPattern);

  if (match24) {
    return {
      startTime: `${match24[1].padStart(2, "0")}:${match24[2]}`,
      endTime: `${match24[3].padStart(2, "0")}:${match24[4]}`,
    };
  }

  const rangePattern =
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;

  const match = normalized.match(rangePattern);

  if (!match) {
    return null;
  }

  let startHour = Number(match[1]);
  const startMinute = Number(match[2] || "00");
  let startPeriod = match[3] || null;

  let endHour = Number(match[4]);
  const endMinute = Number(match[5] || "00");
  let endPeriod = match[6] || null;

  if (
    startHour < 1 ||
    startHour > 12 ||
    endHour < 1 ||
    endHour > 12
  ) {
    return null;
  }

  /*
   * If only the end has AM/PM, use it to interpret the end.
   *
   * For:
   *   5 to 6pm
   * both become PM.
   *
   * For:
   *   11 to 1pm
   * the natural interpretation is 11 AM to 1 PM.
   */
  if (!startPeriod && endPeriod) {
    startPeriod =
      endPeriod === "pm" && endHour < startHour
        ? "am"
        : endPeriod;
  }

  if (!startPeriod && !endPeriod) {
    return null;
  }

  if (!endPeriod && startPeriod) {
    endPeriod = startPeriod;
  }

  if (startPeriod === "pm" && startHour < 12) {
    startHour += 12;
  }

  if (startPeriod === "am" && startHour === 12) {
    startHour = 0;
  }

  if (endPeriod === "pm" && endHour < 12) {
    endHour += 12;
  }

  if (endPeriod === "am" && endHour === 12) {
    endHour = 0;
  }

  return {
    startTime: `${String(startHour).padStart(2, "0")}:${String(
      startMinute
    ).padStart(2, "0")}`,
    endTime: `${String(endHour).padStart(2, "0")}:${String(
      endMinute
    ).padStart(2, "0")}`,
  };
}

/**
 * Resolve natural-language dates in the company timezone.
 */
export function parseNaturalLanguageDate(
  input: string,
  referenceDate = new Date()
): { dateStr: string; formattedDate: string } | null {
  const normalized = input.trim().toLowerCase();

  const todayStr = formatInTimeZone(
    referenceDate,
    COMPANY_TIMEZONE,
    "yyyy-MM-dd"
  );

  const today = parse(
    todayStr,
    "yyyy-MM-dd",
    new Date()
  );

  if (/\bday after tomorrow\b/.test(normalized)) {
    const target = addDays(today, 2);

    return {
      dateStr: format(target, "yyyy-MM-dd"),
      formattedDate: format(target, "MMMM d, yyyy"),
    };
  }

  if (/\btomorrow\b/.test(normalized)) {
    const target = addDays(today, 1);

    return {
      dateStr: format(target, "yyyy-MM-dd"),
      formattedDate: format(target, "MMMM d, yyyy"),
    };
  }

  if (/\btoday\b/.test(normalized)) {
    return {
      dateStr: todayStr,
      formattedDate: format(today, "MMMM d, yyyy"),
    };
  }

  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  for (let i = 0; i < weekdays.length; i++) {
    const day = weekdays[i];

    const regex = new RegExp(
      `\\b(next|this|on)?\\s*${day}\\b`,
      "i"
    );

    const match = normalized.match(regex);

    if (!match) {
      continue;
    }

    const modifier = match[1]?.toLowerCase();

    const currentDay = today.getDay();
    let daysAhead = i - currentDay;

    if (modifier === "next") {
      if (daysAhead <= 0) {
        daysAhead += 7;
      } else {
        daysAhead += 7;
      }
    } else if (daysAhead <= 0) {
      daysAhead += 7;
    }

    const target = addDays(today, daysAhead);

    return {
      dateStr: format(target, "yyyy-MM-dd"),
      formattedDate: format(target, "MMMM d, yyyy"),
    };
  }

  const isoMatch = normalized.match(
    /\b(20\d{2}-\d{2}-\d{2})\b/
  );

  if (isoMatch) {
    const parsed = parse(
      isoMatch[1],
      "yyyy-MM-dd",
      new Date()
    );

    if (!Number.isNaN(parsed.getTime())) {
      return {
        dateStr: isoMatch[1],
        formattedDate: format(parsed, "MMMM d, yyyy"),
      };
    }
  }

  const monthDateRegex =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})?\b/i;

  const monthMatch = input.match(monthDateRegex);

  if (monthMatch) {
    const month = monthMatch[1];
    const day = monthMatch[2];
    const year =
      monthMatch[3] || todayStr.slice(0, 4);

    const parsed = new Date(
      `${month} ${day}, ${year}`
    );

    if (!Number.isNaN(parsed.getTime())) {
      return {
        dateStr: format(parsed, "yyyy-MM-dd"),
        formattedDate: format(parsed, "MMMM d, yyyy"),
      };
    }
  }

  return null;
}

/**
 * Find a room from the database.
 *
 * "this room" / "here" / "current room" uses roomContextId.
 */
export async function resolveRoom(
  query: string,
  roomContextId?: string | null
): Promise<{
  room: RoomData | null;
  isAmbiguousContext?: boolean;
}> {
  const normalized = query.trim().toLowerCase();

  if (
    /\b(this room|here|current room)\b/i.test(
      normalized
    )
  ) {
    if (!roomContextId) {
      return {
        room: null,
        isAmbiguousContext: true,
      };
    }

    const room = await prisma.room.findUnique({
      where: {
        id: roomContextId,
      },
    });

    return {
      room: room
        ? {
            id: room.id,
            roomCode: room.roomCode,
            name: room.name,
            building: room.building,
            floor: room.floor,
            capacity: room.capacity,
            description: room.description,
            equipment: room.equipment,
            isActive: room.isActive,
          }
        : null,
    };
  }

  const rooms = await prisma.room.findMany({
    orderBy: {
      name: "asc",
    },
  });

  const exactCode = rooms.find(
    (room) =>
      room.roomCode.toLowerCase() === normalized
  );

  if (exactCode) {
    return { room: exactCode };
  }

  const exactName = rooms.find(
    (room) =>
      room.name.toLowerCase() === normalized
  );

  if (exactName) {
    return { room: exactName };
  }

  const containsMatch = rooms.find((room) => {
    const name = room.name.toLowerCase();
    const code = room.roomCode.toLowerCase();

    return (
      normalized.includes(name) ||
      normalized.includes(code) ||
      name.includes(normalized) ||
      code.includes(normalized)
    );
  });

  if (containsMatch) {
    return { room: containsMatch };
  }

  const simplifiedQuery = normalized
    .replace(/\bconference\s+room\b/gi, "")
    .replace(/\broom\b/gi, "")
    .trim();

  const fuzzyMatch = rooms.find((room) => {
    const simplifiedName = room.name
      .toLowerCase()
      .replace(/\bconference\s+room\b/gi, "")
      .replace(/\broom\b/gi, "")
      .trim();

    return (
      simplifiedName.length > 0 &&
      (simplifiedQuery.includes(simplifiedName) ||
        simplifiedName.includes(simplifiedQuery))
    );
  });

  return {
    room: fuzzyMatch || null,
  };
}

/**
 * Get active rooms with their basic metadata.
 */
async function getActiveRooms(): Promise<RoomData[]> {
  return prisma.room.findMany({
    where: {
      isActive: true,
    },
    orderBy: [
      {
        building: "asc",
      },
      {
        floor: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
}

/**
 * Get confirmed bookings for a time window.
 *
 * Cancelled bookings are deliberately excluded.
 */
async function getBookingsForWindow(
  start: Date,
  end: Date,
  roomId?: string
): Promise<ScheduleBooking[]> {
  return prisma.booking.findMany({
    where: {
      ...(roomId ? { roomId } : {}),
      status: "CONFIRMED",
      startTime: {
        lt: end,
      },
      endTime: {
        gt: start,
      },
    },
    orderBy: {
      startTime: "asc",
    },
    select: {
      id: true,
      title: true,
      organizerName: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });
}

/**
 * Return a readable schedule for all active rooms.
 */
async function getRoomSchedules(
  dateStr: string,
  startTime = "00:00",
  endTime = "23:59"
) {
  const startUTC = parseCompanyDateTimeToUTC(
    dateStr,
    startTime
  );

  const endUTC = parseCompanyDateTimeToUTC(
    dateStr,
    endTime
  );

  const rooms = await getActiveRooms();

  const results = [];

  for (const room of rooms) {
    const bookings = await getBookingsForWindow(
      startUTC,
      endUTC,
      room.id
    );

    results.push({
      room: {
        id: room.id,
        name: room.name,
        roomCode: room.roomCode,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
        equipment: room.equipment,
      },
      bookings: bookings.map((booking) => ({
        id: booking.id,
        title: booking.title,
        organizerName: booking.organizerName,
        startTime: formatInTimeZone(
          booking.startTime,
          COMPANY_TIMEZONE,
          "HH:mm"
        ),
        endTime: formatInTimeZone(
          booking.endTime,
          COMPANY_TIMEZONE,
          "HH:mm"
        ),
      })),
    });
  }

  return results;
}

/**
 * Determine whether a room is available for a requested period.
 */
async function getAvailabilityForRoom(
  room: RoomData,
  dateStr: string,
  startTime: string,
  endTime: string
) {
  const startUTC = parseCompanyDateTimeToUTC(
    dateStr,
    startTime
  );

  const endUTC = parseCompanyDateTimeToUTC(
    dateStr,
    endTime
  );

  const availability = await checkRoomAvailability({
    roomId: room.id,
    startTime: startUTC,
    endTime: endUTC,
  });

  return {
    room,
    dateStr,
    startTime,
    endTime,
    isAvailable: availability.isAvailable,
  };
}

/**
 * Ask Gemini to understand the user's request.
 *
 * Gemini is only an interpreter here.
 * It never receives database credentials and never executes SQL.
 */
async function interpretWithGemini(params: {
  message: string;
  user: UserSession;
  roomContextId?: string | null;
  pendingAction?: ChatPendingAction | null;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}): Promise<GeminiIntent> {
  const {
    message,
    user,
    roomContextId,
    pendingAction,
    conversationHistory = [],
  } = params;

  if (!ai) {
    return fallbackInterpretation(message);
  }

  const historyText = conversationHistory
    .slice(-12)
    .map(
      (item) =>
        `${item.role === "user" ? "USER" : "ASSISTANT"}: ${item.text}`
    )
    .join("\n");

  const pendingText = pendingAction
    ? JSON.stringify({
        roomName: pendingAction.roomName,
        roomCode: pendingAction.roomCode,
        date: pendingAction.formattedDate,
        startTime: pendingAction.startTime,
        endTime: pendingAction.endTime,
        title: pendingAction.title,
      })
    : "none";

  const prompt = `
You are the natural-language understanding layer for an internal Enterprise Conference Room Booking application.

Your job is ONLY to understand the user's request and return structured JSON.

You do NOT execute actions.
You do NOT access databases.
You do NOT invent room names, bookings, availability, users, or application features.

Authenticated user:
- role: ${user.role}
- name: ${user.name}
- current room context ID: ${roomContextId || "none"}

Current pending booking action:
${pendingText}

Recent conversation:
${historyText || "none"}

Current user message:
${message}

Supported intents:
GENERAL
CHECK_AVAILABILITY
GET_SCHEDULE
BOOK
CANCEL_BOOKING
MY_BOOKINGS
MY_REQUESTS
ROOM_INFO
HELP

Interpret relative dates using the user's/company timezone (${COMPANY_TIMEZONE}).

Time rules:
- "5 to 6pm" means 17:00 to 18:00.
- "5pm to 6pm" means 17:00 to 18:00.
- "5am to 6pm" means 05:00 to 18:00.
- "11 to 1pm" means 11:00 to 13:00.
- "11am to 1pm" means 11:00 to 13:00.
- "noon to 1pm" means 12:00 to 13:00.
- "17:00 to 18:00" remains 17:00 to 18:00.
- If the user gives only a duration such as "for an hour", preserve durationMinutes and leave start/end null unless a start time is available from context.
- "this room", "here", and "current room" refer to the current room context when one exists.

Conversation context matters.
Examples:
- "what about Room B?" should refer to the previous availability/schedule discussion.
- "book that one" should refer to the previously selected room.
- "make it two hours" should modify the previous booking time.
- "actually tomorrow" should modify the pending booking date.
- "No, I meant 5am to 6pm" is a correction to the previous pending action.

For availability questions, do NOT convert them into BOOK unless the user explicitly asks to reserve/book/schedule.

For questions about how to use the application, use HELP.

Return ONLY valid JSON matching this shape:
{
  "intent": "...",
  "roomQuery": "..." or null,
  "dateExpression": "..." or null,
  "startTime": "HH:mm" or null,
  "endTime": "HH:mm" or null,
  "durationMinutes": number or null,
  "title": "..." or null,
  "description": "..." or null,
  "query": "..." or null
}
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            intent: {
              type: "STRING",
              enum: [
                "GENERAL",
                "CHECK_AVAILABILITY",
                "GET_SCHEDULE",
                "BOOK",
                "CANCEL_BOOKING",
                "MY_BOOKINGS",
                "MY_REQUESTS",
                "ROOM_INFO",
                "HELP",
              ],
            },
            roomQuery: {
              type: "STRING",
              nullable: true,
            },
            dateExpression: {
              type: "STRING",
              nullable: true,
            },
            startTime: {
              type: "STRING",
              nullable: true,
            },
            endTime: {
              type: "STRING",
              nullable: true,
            },
            durationMinutes: {
              type: "NUMBER",
              nullable: true,
            },
            title: {
              type: "STRING",
              nullable: true,
            },
            description: {
              type: "STRING",
              nullable: true,
            },
            query: {
              type: "STRING",
              nullable: true,
            },
          },
          required: ["intent"],
        },
      },
    });

    const text = response.text?.trim();

    if (!text) {
      return fallbackInterpretation(message);
    }

    const parsed = JSON.parse(text) as GeminiIntent;

    return {
      intent: parsed.intent || "GENERAL",
      roomQuery: parsed.roomQuery || null,
      dateExpression: parsed.dateExpression || null,
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      durationMinutes:
        typeof parsed.durationMinutes === "number"
          ? parsed.durationMinutes
          : null,
      title: parsed.title || null,
      description: parsed.description || null,
      query: parsed.query || null,
    };
  } catch (error) {
    console.error(
      "Gemini interpretation failed:",
      error
    );

    return fallbackInterpretation(message);
  }
}

/**
 * Deterministic fallback.
 *
 * The application remains usable if Gemini is temporarily unavailable.
 */
function fallbackInterpretation(
  message: string
): GeminiIntent {
  const normalized = message
    .trim()
    .toLowerCase();

  const times = parseTimeRange(message);
  const date = parseNaturalLanguageDate(message);

  if (
    /\b(available|availability|free)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "CHECK_AVAILABILITY",
      roomQuery: null,
      dateExpression: date?.dateStr || null,
      startTime: times?.startTime || null,
      endTime: times?.endTime || null,
      durationMinutes: null,
      title: null,
      description: null,
      query: message,
    };
  }

  if (
    /\b(schedule|bookings|meetings)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "GET_SCHEDULE",
      roomQuery: null,
      dateExpression: date?.dateStr || null,
      startTime: times?.startTime || null,
      endTime: times?.endTime || null,
      durationMinutes: null,
      title: null,
      description: null,
      query: message,
    };
  }

  if (
    /\b(book|reserve|schedule|need a room)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "BOOK",
      roomQuery: null,
      dateExpression: date?.dateStr || null,
      startTime: times?.startTime || null,
      endTime: times?.endTime || null,
      durationMinutes: null,
      title: null,
      description: null,
      query: message,
    };
  }

  if (
    /\b(my bookings|my meetings)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "MY_BOOKINGS",
      query: message,
    };
  }

  if (
    /\b(my requests|booking requests)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "MY_REQUESTS",
      query: message,
    };
  }

  if (
    /\b(help|how do i|where do i|what can you do)\b/.test(
      normalized
    )
  ) {
    return {
      intent: "HELP",
      query: message,
    };
  }

  return {
    intent: "GENERAL",
    query: message,
  };
}

/**
 * Generate a natural-language response from structured application data.
 *
 * The model receives facts from our server, not database access.
 */
async function formulateResponse(params: {
  message: string;
  intent: ChatIntent;
  facts: unknown;
  user: UserSession;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}): Promise<string> {
  const {
    message,
    intent,
    facts,
    user,
    conversationHistory = [],
  } = params;

  if (!ai) {
    return deterministicResponse(
      intent,
      facts,
      user
    );
  }

  const historyText = conversationHistory
    .slice(-8)
    .map(
      (item) =>
        `${item.role === "user" ? "USER" : "ASSISTANT"}: ${item.text}`
    )
    .join("\n");

  const prompt = `
You are the response-writing layer of an enterprise conference room assistant.

Answer the user naturally and concisely.

You may ONLY use facts contained in APPLICATION FACTS below.
Never invent:
- rooms
- meetings
- availability
- users
- booking IDs
- permissions
- application features

The authenticated role is ${user.role}.

User message:
${message}

Intent:
${intent}

Recent conversation:
${historyText || "none"}

APPLICATION FACTS:
${JSON.stringify(facts, null, 2)}

If the facts contain room schedules, explain them clearly.
If a room is occupied, show the meeting interval.
If a room is free, say when it is free based on the supplied interval.
If multiple rooms are returned, summarize each relevant room separately.

Use 24-hour time for booking-related details.

Do not claim that an action was completed unless the facts explicitly say it was completed.

Return only the answer text.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    return (
      response.text?.trim() ||
      deterministicResponse(intent, facts, user)
    );
  } catch (error) {
    console.error(
      "Gemini response generation failed:",
      error
    );

    return deterministicResponse(
      intent,
      facts,
      user
    );
  }
}

function deterministicResponse(
  intent: ChatIntent,
  facts: any,
  user: UserSession
): string {
  if (intent === "CHECK_AVAILABILITY") {
    if (facts?.rooms) {
      return facts.rooms
        .map((item: any) => {
          return `${item.room.name}: ${
            item.isAvailable ? "Available" : "Not available"
          }.`;
        })
        .join("\n");
    }

    return "I couldn't determine room availability.";
  }

  if (intent === "GET_SCHEDULE") {
    if (facts?.schedules) {
      return facts.schedules
        .map((item: any) => {
          const bookings = item.bookings || [];

          if (!bookings.length) {
            return `${item.room.name}: No meetings scheduled.`;
          }

          return `${item.room.name}: ${bookings
            .map(
              (booking: any) =>
                `${booking.startTime}-${booking.endTime} ${booking.title}`
            )
            .join(", ")}`;
        })
        .join("\n");
    }

    return "I couldn't retrieve the room schedule.";
  }

  if (intent === "ROOM_INFO") {
    if (facts?.room) {
      const room = facts.room;

      return [
        `${room.name} (${room.roomCode})`,
        `Building: ${room.building}`,
        `Floor: ${room.floor}`,
        `Capacity: ${room.capacity}`,
        `Equipment: ${
          room.equipment?.join(", ") || "None listed"
        }`,
      ].join("\n");
    }
  }

  if (intent === "HELP") {
    return [
      "I can help you with conference rooms, availability, schedules, and bookings.",
      "",
      "Examples:",
      "• What rooms are available tomorrow afternoon?",
      "• What meetings are scheduled in Room A tomorrow?",
      "• Book this room tomorrow from 17:00 to 18:00.",
      "• What about Room B?",
      "• Show my bookings.",
    ].join("\n");
  }

  if (intent === "MY_BOOKINGS") {
    return facts?.bookings?.length
      ? facts.bookings
          .map(
            (booking: any) =>
              `${booking.room.name}: ${booking.title}`
          )
          .join("\n")
      : "You don't have any confirmed bookings.";
  }

  if (intent === "MY_REQUESTS") {
    return facts?.requests?.length
      ? facts.requests
          .map(
            (request: any) =>
              `${request.room.name}: ${request.title} (${request.status})`
          )
          .join("\n")
      : "You don't have any booking requests.";
  }

  return "I can help with conference room availability, schedules, bookings, and booking requests. What would you like to do?";
}

/**
 * Create the pending booking action after availability has been
 * checked by the server.
 */
function buildPendingAction(params: {
  room: RoomData;
  dateStr: string;
  formattedDate: string;
  startTime: string;
  endTime: string;
  user: UserSession;
  title?: string | null;
  description?: string | null;
}): ChatPendingAction {
  const {
    room,
    dateStr,
    formattedDate,
    startTime,
    endTime,
    user,
    title,
    description,
  } = params;

  const startUTC = parseCompanyDateTimeToUTC(
    dateStr,
    startTime
  );

  const endUTC = parseCompanyDateTimeToUTC(
    dateStr,
    endTime
  );

  return {
    roomId: room.id,
    roomName: room.name,
    roomCode: room.roomCode,
    date: dateStr,
    formattedDate,
    startTime,
    endTime,
    title: title || `${user.name}'s Meeting`,
    description: description || null,
    userId: user.id,
    userRole: user.role,
    startUTC: startUTC.toISOString(),
    endUTC: endUTC.toISOString(),
    confirmationRequired: true,
  };
}

/**
 * Execute an explicitly confirmed pending action.
 *
 * Server-side role is authoritative.
 */
async function executePendingAction(
  pendingAction: ChatPendingAction,
  user: UserSession
): Promise<ChatProcessResult> {
  if (pendingAction.userId !== user.id) {
    return {
      reply:
        "Security validation failed. This pending action does not belong to your account.",
      pendingAction: null,
    };
  }

  const startUTC = new Date(
    pendingAction.startUTC
  );

  const endUTC = new Date(
    pendingAction.endUTC
  );

  const room = await prisma.room.findUnique({
    where: {
      id: pendingAction.roomId,
    },
  });

  if (!room || !room.isActive) {
    return {
      reply: `${pendingAction.roomName} is currently inactive and cannot be booked.`,
      pendingAction: null,
    };
  }

  const availability = await checkRoomAvailability({
    roomId: room.id,
    startTime: startUTC,
    endTime: endUTC,
  });

  if (!availability.isAvailable) {
    return {
      reply: `${room.name} is no longer available on ${pendingAction.formattedDate} from ${pendingAction.startTime} to ${pendingAction.endTime}. Another booking has taken this slot.`,
      pendingAction: null,
    };
  }

  if (user.role === "ADMIN") {
    const booking = await createBooking({
      roomId: room.id,
      createdById: user.id,
      organizerName: user.name,
      title:
        pendingAction.title ||
        "Executive Meeting",
      description:
        pendingAction.description || null,
      startTime: startUTC,
      endTime: endUTC,
    });

    return {
      reply: `Booking confirmed. ${room.name} is booked on ${pendingAction.formattedDate} from ${pendingAction.startTime} to ${pendingAction.endTime}.`,
      pendingAction: null,
      actionExecuted: "BOOKING_CREATED",
      booking,
    };
  }

  const bookingRequest =
    await createBookingRequest({
      requesterId: user.id,
      roomId: room.id,
      title:
        pendingAction.title ||
        "Team Collaboration Meeting",
      description:
        pendingAction.description || null,
      startTime: startUTC,
      endTime: endUTC,
    });

  return {
    reply:
      "Your booking request has been sent to an administrator. You will be notified once it is approved or rejected.",
    pendingAction: null,
    actionExecuted:
      "BOOKING_REQUEST_CREATED",
    bookingRequest,
  };
}

/**
 * Main chatbot processor.
 *
 * The current route remains compatible with this function.
 * Conversation history is optional and will be wired into the
 * frontend/API in the next step.
 */
export async function processChatMessage(params: {
  message: string;
  user: UserSession;
  roomContextId?: string | null;
  pendingAction?: ChatPendingAction | null;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}): Promise<ChatProcessResult> {
  const {
    message,
    user,
    roomContextId,
    pendingAction,
    conversationHistory = [],
  } = params;

  const normalized = message.trim().toLowerCase();

  /*
   * Explicit confirmation is handled before Gemini.
   * This is intentional: booking execution must not depend
   * on probabilistic interpretation.
   */
  const isYes =
    /^(yes|yes please|confirm|book it|send request|yes, book it|yes, send request|please book it|yes do it|proceed)$/i.test(
      normalized
    );

  if (isYes) {
    if (!pendingAction) {
      return {
        reply:
          "There is no pending booking action to confirm. Tell me which room, date, and time you need.",
        pendingAction: null,
      };
    }

    return executePendingAction(
      pendingAction,
      user
    );
  }

  const isNo =
    /^(no|cancel|don't book it|dont book it|never mind|nevermind|no don't|stop)$/i.test(
      normalized
    );

  if (isNo && pendingAction) {
    return {
      reply:
        "Okay, I won't create the booking.",
      pendingAction: null,
      actionExecuted: "CANCELLED",
    };
  }

  /*
   * Gemini interprets the current message using the
   * available conversation context.
   */
  const intent = await interpretWithGemini({
    message,
    user,
    roomContextId,
    pendingAction,
    conversationHistory,
  });

  /*
   * Corrections to an existing booking action.
   *
   * We still validate the resulting times ourselves.
   */
  if (
    pendingAction &&
    (intent.intent === "BOOK" ||
      intent.startTime ||
      intent.endTime ||
      intent.dateExpression ||
      intent.roomQuery)
  ) {
    const roomResult = intent.roomQuery
      ? await resolveRoom(
          intent.roomQuery,
          roomContextId
        )
      : {
          room: await prisma.room.findUnique({
            where: {
              id: pendingAction.roomId,
            },
          }),
        };

    if (
      "isAmbiguousContext" in roomResult &&
      roomResult.isAmbiguousContext
    ) {
      return {
        reply:
          "Which conference room do you mean?",
        pendingAction,
      };
    }

    const room = roomResult.room;

    if (!room) {
      return {
        reply:
          "I couldn't identify that conference room.",
        pendingAction,
      };
    }

    const dateInfo = intent.dateExpression
      ? parseNaturalLanguageDate(
          intent.dateExpression
        )
      : null;

    const startTime =
      intent.startTime ||
      pendingAction.startTime;

    const endTime =
      intent.endTime ||
      pendingAction.endTime;

    const dateStr =
      dateInfo?.dateStr || pendingAction.date;

    const formattedDate =
      dateInfo?.formattedDate ||
      pendingAction.formattedDate;

    const startUTC =
      parseCompanyDateTimeToUTC(
        dateStr,
        startTime
      );

    const endUTC =
      parseCompanyDateTimeToUTC(
        dateStr,
        endTime
      );

    if (endUTC <= startUTC) {
      return {
        reply:
          "The end time must be after the start time.",
        pendingAction,
      };
    }

    const availability =
      await checkRoomAvailability({
        roomId: room.id,
        startTime: startUTC,
        endTime: endUTC,
      });

    if (!availability.isAvailable) {
      return {
        reply: `${room.name} is not available on ${formattedDate} from ${startTime} to ${endTime}.`,
        pendingAction,
      };
    }

    const updatedPendingAction =
      buildPendingAction({
        room,
        dateStr,
        formattedDate,
        startTime,
        endTime,
        user,
        title:
          intent.title ||
          pendingAction.title,
        description:
          intent.description ||
          pendingAction.description,
      });

    const confirmation =
      user.role === "ADMIN"
        ? `${room.name} is available on ${formattedDate} from ${startTime} to ${endTime}. Would you like me to book it?`
        : `${room.name} is available on ${formattedDate} from ${startTime} to ${endTime}. Would you like me to send this booking request to an administrator?`;

    return {
      reply: confirmation,
      pendingAction: updatedPendingAction,
    };
  }

  /*
   * ROOM INFORMATION
   */
  if (intent.intent === "ROOM_INFO") {
    let room: RoomData | null = null;

    if (intent.roomQuery) {
      const resolved =
        await resolveRoom(
          intent.roomQuery,
          roomContextId
        );

      room = resolved.room;
    } else if (roomContextId) {
      const resolved =
        await resolveRoom(
          "this room",
          roomContextId
        );

      room = resolved.room;
    }

    if (!room) {
      const rooms = await getActiveRooms();

      const reply =
        await formulateResponse({
          message,
          intent: "ROOM_INFO",
          facts: {
            rooms,
          },
          user,
          conversationHistory,
        });

      return {
        reply,
        pendingAction: null,
      };
    }

    const reply =
      await formulateResponse({
        message,
        intent: "ROOM_INFO",
        facts: {
          room,
        },
        user,
        conversationHistory,
      });

    return {
      reply,
      pendingAction: null,
    };
  }

  /*
   * CHECK AVAILABILITY
   */
  if (intent.intent === "CHECK_AVAILABILITY") {
    const dateInfo = intent.dateExpression
      ? parseNaturalLanguageDate(
          intent.dateExpression
        )
      : null;

    if (!dateInfo) {
      return {
        reply:
          "What date would you like me to check?",
        pendingAction: null,
      };
    }

    const roomResult = intent.roomQuery
      ? await resolveRoom(
          intent.roomQuery,
          roomContextId
        )
      : { room: null };

    if (
      "isAmbiguousContext" in roomResult &&
      roomResult.isAmbiguousContext
    ) {
      return {
        reply:
          "Which conference room do you mean?",
        pendingAction: null,
      };
    }

    const startTime =
      intent.startTime || "00:00";

    const endTime =
      intent.endTime || "23:59";

    if (roomResult.room) {
      const availability =
        await getAvailabilityForRoom(
          roomResult.room,
          dateInfo.dateStr,
          startTime,
          endTime
        );

      const schedules =
        await getRoomSchedules(
          dateInfo.dateStr,
          startTime,
          endTime
        );

      const reply =
        await formulateResponse({
          message,
          intent: "CHECK_AVAILABILITY",
          facts: {
            date: dateInfo.formattedDate,
            requestedTime: {
              start: startTime,
              end: endTime,
            },
            room: availability.room,
            isAvailable:
              availability.isAvailable,
            schedules: schedules.filter(
              (item) =>
                item.room.id ===
                availability.room.id
            ),
          },
          user,
          conversationHistory,
        });

      return {
        reply,
        pendingAction: null,
      };
    }

    /*
     * No room specified:
     * query every active room.
     */
    const rooms = await getActiveRooms();

    const availabilityResults =
      await Promise.all(
        rooms.map((room) =>
          getAvailabilityForRoom(
            room,
            dateInfo.dateStr,
            startTime,
            endTime
          )
        )
      );

    const schedules =
      await getRoomSchedules(
        dateInfo.dateStr,
        startTime,
        endTime
      );

    const reply =
      await formulateResponse({
        message,
        intent: "CHECK_AVAILABILITY",
        facts: {
          date: dateInfo.formattedDate,
          requestedTime: {
            start: startTime,
            end: endTime,
          },
          rooms: availabilityResults,
          schedules,
        },
        user,
        conversationHistory,
      });

    return {
      reply,
      pendingAction: null,
    };
  }

  /*
   * GET ROOM SCHEDULE
   */
  if (intent.intent === "GET_SCHEDULE") {
    const dateInfo = intent.dateExpression
      ? parseNaturalLanguageDate(
          intent.dateExpression
        )
      : null;

    if (!dateInfo) {
      return {
        reply:
          "What date would you like me to check?",
        pendingAction: null,
      };
    }

    const roomResult = intent.roomQuery
      ? await resolveRoom(
          intent.roomQuery,
          roomContextId
        )
      : { room: null };

    const schedules =
      await getRoomSchedules(
        dateInfo.dateStr,
        intent.startTime || "00:00",
        intent.endTime || "23:59"
      );

    const filteredSchedules =
      roomResult.room
        ? schedules.filter(
            (item) =>
              item.room.id ===
              roomResult.room?.id
          )
        : schedules;

    const reply =
      await formulateResponse({
        message,
        intent: "GET_SCHEDULE",
        facts: {
          date: dateInfo.formattedDate,
          schedules: filteredSchedules,
        },
        user,
        conversationHistory,
      });

    return {
      reply,
      pendingAction: null,
    };
  }

  /*
   * MY BOOKINGS
   */
  if (intent.intent === "MY_BOOKINGS") {
    const bookings =
      await prisma.booking.findMany({
        where: {
          createdById: user.id,
          status: "CONFIRMED",
        },
        orderBy: {
          startTime: "desc",
        },
        take: 20,
        include: {
          room: true,
        },
      });

    const reply =
      await formulateResponse({
        message,
        intent: "MY_BOOKINGS",
        facts: {
          bookings,
        },
        user,
        conversationHistory,
      });

    return {
      reply,
      pendingAction: null,
    };
  }

  /*
   * MY REQUESTS
   */
  if (intent.intent === "MY_REQUESTS") {
    const requests =
      await prisma.bookingRequest.findMany({
        where: {
          requesterId: user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        include: {
          room: true,
        },
      });

    const reply =
      await formulateResponse({
        message,
        intent: "MY_REQUESTS",
        facts: {
          requests,
        },
        user,
        conversationHistory,
      });

    return {
      reply,
      pendingAction: null,
    };
  }

  /*
   * BOOKING
   */
  if (intent.intent === "BOOK") {
    let roomResult = intent.roomQuery
      ? await resolveRoom(
          intent.roomQuery,
          roomContextId
        )
      : {
          room: null,
          isAmbiguousContext: false,
        };

    if (
      roomResult.isAmbiguousContext
    ) {
      return {
        reply:
          "Which conference room do you mean? I don't have a current room context.",
        pendingAction: null,
      };
    }

    if (!roomResult.room) {
      if (roomContextId) {
        roomResult =
          await resolveRoom(
            "this room",
            roomContextId
          );
      }
    }

    if (!roomResult.room) {
      return {
        reply:
          "Which conference room would you like to book?",
        pendingAction: null,
      };
    }

    const room = roomResult.room;

    if (!room.isActive) {
      return {
        reply: `${room.name} is currently inactive and cannot be booked.`,
        pendingAction: null,
      };
    }

    const dateInfo =
      intent.dateExpression
        ? parseNaturalLanguageDate(
            intent.dateExpression
          )
        : null;

    if (!dateInfo) {
      return {
        reply: `What date would you like to book ${room.name}?`,
        pendingAction: null,
      };
    }

    let startTime =
      intent.startTime || null;

    let endTime =
      intent.endTime || null;

    /*
     * If Gemini gave a duration but not an end time,
     * use the start time plus that duration.
     */
    if (
      startTime &&
      !endTime &&
      intent.durationMinutes
    ) {
      const [hours, minutes] =
        startTime.split(":").map(Number);

      const total =
        hours * 60 +
        minutes +
        intent.durationMinutes;

      const endHours =
        Math.floor(total / 60) % 24;

      const endMinutes = total % 60;

      endTime = `${String(
        endHours
      ).padStart(2, "0")}:${String(
        endMinutes
      ).padStart(2, "0")}`;
    }

    if (!startTime || !endTime) {
      return {
        reply:
          "What start and end time would you like?",
        pendingAction: null,
      };
    }

    /*
     * Deterministic validation of Gemini's time output.
     */
    const normalizedTimes =
      parseTimeRange(
        `${startTime} to ${endTime}`
      );

    if (!normalizedTimes) {
      return {
        reply:
          "I couldn't determine a valid start and end time. Please provide them in a format such as 17:00 to 18:00.",
        pendingAction: null,
      };
    }

    startTime =
      normalizedTimes.startTime;

    endTime =
      normalizedTimes.endTime;

    const startUTC =
      parseCompanyDateTimeToUTC(
        dateInfo.dateStr,
        startTime
      );

    const endUTC =
      parseCompanyDateTimeToUTC(
        dateInfo.dateStr,
        endTime
      );

    if (endUTC <= startUTC) {
      return {
        reply:
          "The end time must be after the start time.",
        pendingAction: null,
      };
    }

    const availability =
      await checkRoomAvailability({
        roomId: room.id,
        startTime: startUTC,
        endTime: endUTC,
      });

    if (!availability.isAvailable) {
      const schedules =
        await getRoomSchedules(
          dateInfo.dateStr,
          startTime,
          endTime
        );

      const reply =
        await formulateResponse({
          message,
          intent: "CHECK_AVAILABILITY",
          facts: {
            date: dateInfo.formattedDate,
            requestedTime: {
              start: startTime,
              end: endTime,
            },
            room,
            isAvailable: false,
            schedules,
          },
          user,
          conversationHistory,
        });

      return {
        reply,
        pendingAction: null,
      };
    }

    const newPendingAction =
      buildPendingAction({
        room,
        dateStr: dateInfo.dateStr,
        formattedDate:
          dateInfo.formattedDate,
        startTime,
        endTime,
        user,
        title: intent.title,
        description: intent.description,
      });

    const confirmation =
      user.role === "ADMIN"
        ? `${room.name} is available on ${dateInfo.formattedDate} from ${startTime} to ${endTime}. Would you like me to book it?`
        : `${room.name} is available on ${dateInfo.formattedDate} from ${startTime} to ${endTime}. Would you like me to send this booking request to an administrator?`;

    return {
      reply: confirmation,
      pendingAction: newPendingAction,
    };
  }

  /*
   * HELP / GENERAL
   */
  const facts = {
    application: "Enterprise Conference Room Booking System",
    authenticatedRole: user.role,
    availableCapabilities: [
      "check room availability",
      "view room schedules",
      "view room information",
      "view your bookings",
      "view your booking requests",
      "request or book conference rooms",
    ],
    bookingRule:
      user.role === "ADMIN"
        ? "Administrators can create confirmed bookings after explicit confirmation."
        : "Employees can submit booking requests after explicit confirmation; they cannot directly create confirmed bookings.",
  };

  const reply =
    await formulateResponse({
      message,
      intent:
        intent.intent === "HELP"
          ? "HELP"
          : "GENERAL",
      facts,
      user,
      conversationHistory,
    });

  return {
    reply,
    pendingAction: null,
  };
}