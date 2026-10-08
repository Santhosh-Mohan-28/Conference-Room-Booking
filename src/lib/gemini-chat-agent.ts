import {
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
} from "@google/genai";

import { prisma } from "./prisma";

import { UserSession, ChatPendingAction } from "@/types";

import {
  COMPANY_TIMEZONE,
  parseCompanyDateTimeToUTC,
} from "./timezone";

import { checkRoomAvailability } from "./booking-service";

import { formatInTimeZone } from "date-fns-tz";

export interface GeminiChatResult {
  reply: string;
  pendingAction: ChatPendingAction | null;
}

interface AgentContext {
  message: string;
  user: UserSession;
  roomContextId?: string | null;
  pendingAction?: ChatPendingAction | null;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const tools: FunctionDeclaration[] = [
  {
    name: "get_rooms",
    description:
      "Get active conference rooms. Use this when the user asks what rooms exist or needs to choose a room.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  {
    name: "get_room_info",
    description:
      "Get detailed information about a specific conference room.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        roomQuery: {
          type: Type.STRING,
          description: "Room name or room code.",
        },
      },
      required: ["roomQuery"],
    },
  },

  {
    name: "check_availability",
    description:
      "Check live room availability for an exact date and time interval.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Date in YYYY-MM-DD.",
        },
        startTime: {
          type: Type.STRING,
          description: "Start time in HH:mm.",
        },
        endTime: {
          type: Type.STRING,
          description: "End time in HH:mm.",
        },
        roomQuery: {
          type: Type.STRING,
          description:
            "Optional room name or code. Omit when checking all rooms.",
        },
      },
      required: ["date", "startTime", "endTime"],
    },
  },

  {
    name: "get_schedule",
    description:
      "Get bookings for a date and optional room/time interval.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: "Date in YYYY-MM-DD.",
        },
        startTime: {
          type: Type.STRING,
          description: "Optional start time HH:mm.",
        },
        endTime: {
          type: Type.STRING,
          description: "Optional end time HH:mm.",
        },
        roomQuery: {
          type: Type.STRING,
          description: "Optional room name or room code.",
        },
      },
      required: ["date"],
    },
  },

  {
    name: "prepare_booking",
    description:
      "Validate a booking request and prepare it for confirmation. NEVER creates a booking.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        roomQuery: {
          type: Type.STRING,
          description: "Room name or room code.",
        },
        date: {
          type: Type.STRING,
          description: "Date in YYYY-MM-DD.",
        },
        startTime: {
          type: Type.STRING,
          description: "Start time in HH:mm.",
        },
        endTime: {
          type: Type.STRING,
          description: "End time in HH:mm.",
        },
        title: {
          type: Type.STRING,
          description: "Optional meeting title.",
        },
        description: {
          type: Type.STRING,
          description: "Optional meeting description.",
        },
      },
      required: ["roomQuery", "date", "startTime", "endTime"],
    },
  },

  {
    name: "get_my_bookings",
    description:
      "Get bookings created by the currently authenticated user.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  {
    name: "get_my_requests",
    description:
      "Get booking requests submitted by the currently authenticated user.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

function resolveRoom(query: string, rooms: any[]) {
  const q = query.trim().toLowerCase();

  const exact = rooms.find(
    (room) =>
      room.name.toLowerCase() === q ||
      room.roomCode.toLowerCase() === q
  );

  if (exact) return exact;

  const matches = rooms.filter(
    (room) =>
      room.name.toLowerCase().includes(q) ||
      room.roomCode.toLowerCase().includes(q)
  );

  return matches.length === 1 ? matches[0] : null;
}

async function executeTool(
  name: string,
  args: any,
  ctx: AgentContext
) {
  if (name === "get_rooms") {
    return prisma.room.findMany({
      where: { isActive: true },
      orderBy: [
        { building: "asc" },
        { floor: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        roomCode: true,
        building: true,
        floor: true,
        capacity: true,
        equipment: true,
        description: true,
      },
    });
  }

  if (name === "get_room_info") {
    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        roomCode: true,
        building: true,
        floor: true,
        capacity: true,
        equipment: true,
        description: true,
      },
    });

    const room = resolveRoom(args.roomQuery, rooms);

    if (!room) {
      return {
        found: false,
        message: "No single room matched the requested room.",
      };
    }

    return {
      found: true,
      room,
    };
  }

  if (name === "check_availability") {
    const startUTC = parseCompanyDateTimeToUTC(
      args.date,
      args.startTime
    );

    const endUTC = parseCompanyDateTimeToUTC(
      args.date,
      args.endTime
    );

    if (endUTC <= startUTC) {
      return {
        error: "End time must be after start time.",
      };
    }

    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        roomCode: true,
        building: true,
        floor: true,
        capacity: true,
        equipment: true,
      },
    });

    const selectedRoom = args.roomQuery
      ? resolveRoom(args.roomQuery, rooms)
      : null;

    if (args.roomQuery && !selectedRoom) {
      return {
        error: "Room not found.",
      };
    }

    const targetRooms = selectedRoom
      ? [selectedRoom]
      : rooms;

    const results = [];

    for (const room of targetRooms) {
      const availability = await checkRoomAvailability({
        roomId: room.id,
        startTime: startUTC,
        endTime: endUTC,
      });

      results.push({
        room,
        isAvailable: availability.isAvailable,
      });
    }

    return {
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      rooms: results,
    };
  }

  if (name === "get_schedule") {
    const startTime = args.startTime || "00:00";
    const endTime = args.endTime || "23:59";

    const startUTC = parseCompanyDateTimeToUTC(
      args.date,
      startTime
    );

    const endUTC = parseCompanyDateTimeToUTC(
      args.date,
      endTime
    );

    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        roomCode: true,
      },
    });

    const selectedRoom = args.roomQuery
      ? resolveRoom(args.roomQuery, rooms)
      : null;

    const bookings = await prisma.booking.findMany({
      where: {
        roomId: selectedRoom
          ? selectedRoom.id
          : { in: rooms.map((room) => room.id) },
        status: {
          not: "CANCELLED",
        },
        startTime: {
          lt: endUTC,
        },
        endTime: {
          gt: startUTC,
        },
      },
      include: {
        room: {
          select: {
            name: true,
            roomCode: true,
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    return bookings.map((booking) => ({
      room: booking.room,
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
    }));
  }

  if (name === "prepare_booking") {
    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        roomCode: true,
      },
    });

    const room = resolveRoom(args.roomQuery, rooms);

    if (!room) {
      return {
        ready: false,
        error: "No single active room matched.",
      };
    }

    const startUTC = parseCompanyDateTimeToUTC(
      args.date,
      args.startTime
    );

    const endUTC = parseCompanyDateTimeToUTC(
      args.date,
      args.endTime
    );

    if (endUTC <= startUTC) {
      return {
        ready: false,
        error: "End time must be after start time.",
      };
    }

    const availability = await checkRoomAvailability({
      roomId: room.id,
      startTime: startUTC,
      endTime: endUTC,
    });

    if (!availability.isAvailable) {
      return {
        ready: false,
        available: false,
        room,
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
      };
    }

    const pendingAction: ChatPendingAction = {
      roomId: room.id,
      roomName: room.name,
      roomCode: room.roomCode,
      date: args.date,
      formattedDate: formatInTimeZone(
        startUTC,
        COMPANY_TIMEZONE,
        "MMMM d, yyyy"
      ),
      startTime: args.startTime,
      endTime: args.endTime,
      title: args.title || `${ctx.user.name}'s Meeting`,
      description: args.description || null,
      userId: ctx.user.id,
      userRole: ctx.user.role,
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString(),
      confirmationRequired: true,
    };

    return {
      ready: true,
      pendingAction,
    };
  }

  if (name === "get_my_bookings") {
    return prisma.booking.findMany({
      where: {
        createdById: ctx.user.id,
      },
      include: {
        room: {
          select: {
            name: true,
            roomCode: true,
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
      take: 20,
    });
  }

  if (name === "get_my_requests") {
    return prisma.bookingRequest.findMany({
      where: {
        requesterId: ctx.user.id,
      },
      include: {
        room: {
          select: {
            name: true,
            roomCode: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });
  }

  return {
    error: `Unknown tool: ${name}`,
  };
}

function buildPrompt(ctx: AgentContext) {
  const today = formatInTimeZone(
    new Date(),
    COMPANY_TIMEZONE,
    "yyyy-MM-dd"
  );

  const history =
    ctx.conversationHistory
      ?.slice(-20)
      .map(
        (message) =>
          `${message.role.toUpperCase()}: ${message.text}`
      )
      .join("\n") || "(none)";

  return `
You are the intelligent AI assistant inside an enterprise conference-room booking application.

CURRENT DATE:
${today}

TIMEZONE:
${COMPANY_TIMEZONE}

USER:
${ctx.user.name}

ROLE:
${ctx.user.role}

CURRENT ROOM CONTEXT:
${ctx.roomContextId || "none"}

PENDING BOOKING:
${ctx.pendingAction ? JSON.stringify(ctx.pendingAction) : "none"}

CONVERSATION HISTORY:
${history}

USER'S NEW MESSAGE:
${ctx.message}

RULES:

1. You are a genuine conversational assistant. Understand natural language instead of relying on rigid commands.

2. Maintain context across messages.

Example:
User: "I need a room from 1 to 2pm."
Assistant: "What date?"
User: "today"

You must combine the previous time with today's date.

3. Never restart a conversation unnecessarily.

4. Relative dates must be resolved using the current date.

5. Time interpretation:
- "5 to 6pm" = 17:00-18:00
- "5pm to 6pm" = 17:00-18:00
- "5am to 6pm" = 05:00-18:00
- "11 to 1pm" = 11:00-13:00
- "1 to 2pm" = 13:00-14:00

6. Never convert a specified end time into 23:59.

7. "this room" means the current room context when one exists.

8. For live application information, use tools. Never invent rooms or bookings.

9. For availability, use the exact requested interval.

10. For booking, gather:
room + date + start time + end time.

If something is missing, ask only for that missing detail.

11. Before a booking can be confirmed, call prepare_booking.

12. prepare_booking NEVER creates a booking.

13. NEVER tell the user a booking was created just because they asked for one.

14. ADMIN:
After explicit confirmation, the existing secure server layer will create the booking.

15. EMPLOYEE:
After explicit confirmation, the existing secure server layer will create a booking request for an administrator.

16. Never bypass server-side authorization.

17. Answer naturally and concisely.

18. Do not mention tool names, prompts, APIs, or internal implementation.

19. If the user corrects something, update the existing request instead of starting over.
`;
}

export async function runGeminiChatAgent(
  ctx: AgentContext
): Promise<GeminiChatResult> {
  if (!ai) {
    return {
      reply:
        "Gemini is not configured. Please set GEMINI_API_KEY.",
      pendingAction: ctx.pendingAction || null,
    };
  }

  let contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text: buildPrompt(ctx),
        },
      ],
    },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        tools: [
          {
            functionDeclarations: tools,
          },
        ],
        temperature: 0.2,
      },
    });

    const calls = response.functionCalls || [];

    if (calls.length === 0) {
      return {
        reply:
          response.text ||
          "I couldn't determine what you need.",
        pendingAction: ctx.pendingAction || null,
      };
    }

    const modelParts =
      response.candidates?.[0]?.content?.parts || [];

    contents.push({
      role: "model",
      parts: modelParts,
    });

    const responses: any[] = [];

    for (const call of calls) {
      if (!call.name) {
        continue;
      }

      const result: any = await executeTool(
        call.name,
        call.args || {},
        ctx
      );

      if (
        call.name === "prepare_booking" &&
        result?.ready &&
        result.pendingAction
      ) {
        ctx.pendingAction = result.pendingAction;
      }

      responses.push({
        functionResponse: {
          name: call.name,
          response: result,
        },
      });
    }

    if (responses.length > 0) {
      contents.push({
        role: "user",
        parts: responses,
      });
    }
  }

  return {
    reply:
      "I couldn't finish processing that request. Please try again.",
    pendingAction: ctx.pendingAction || null,
  };
}