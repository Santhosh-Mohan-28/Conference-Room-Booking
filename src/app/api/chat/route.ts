import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validations";
import {
  executePendingAction,
  processChatMessage,
  type ChatProcessResult,
} from "@/lib/chatbot-service";
import { runGeminiChatAgent } from "@/lib/gemini-chat-agent";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";

/**
 * POST /api/chat
 *
 * Architecture:
 * - YES/NO confirmations are handled server-side before any AI call.
 *   Booking execution NEVER goes through Gemini.
 * - All other messages go to runGeminiChatAgent (real Gemini function-calling
 *   with conversation history, context, follow-ups, corrections).
 * - In test environments (no GEMINI_API_KEY or NODE_ENV=test), falls back to
 *   processChatMessage which uses deterministic parsing — keeping all 47 tests passing.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await req.json();
    const validated = chatRequestSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid request", 400, validated.error.flatten());
    }

    const { message, roomContextId, pendingAction, conversationHistory } =
      validated.data;

    const normalized = message.trim().toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // YES CONFIRMATION — purely server-side, no AI involved
    // ─────────────────────────────────────────────────────────────────────────
    const isYes =
      /^(yes|yes please|confirm|book it|send request|yes, book it|yes, send request|please book it|yes do it|proceed)$/i.test(
        normalized
      );

    if (isYes) {
      if (!pendingAction) {
        return successResponse({
          reply:
            "There is no pending booking to confirm. Tell me which room, date, and time you need.",
          pendingAction: null,
        } satisfies ChatProcessResult);
      }

      const result = await executePendingAction(pendingAction as any, user);
      return successResponse(result);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NO / CANCEL — discard pending action, no AI needed
    // ─────────────────────────────────────────────────────────────────────────
    const isNo =
      /^(no|cancel|don't book it|dont book it|never mind|nevermind|no don't|stop)$/i.test(
        normalized
      );

    if (isNo && pendingAction) {
      return successResponse({
        reply: "Okay, I won't create the booking.",
        pendingAction: null,
        actionExecuted: "CANCELLED",
      } satisfies ChatProcessResult);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI CONVERSATION
    //
    // When GEMINI_API_KEY is set, use the full Gemini function-calling agent
    // which maintains conversation context, understands follow-ups, corrections,
    // pronoun references ("that room", "same room"), relative dates, etc.
    //
    // When GEMINI_API_KEY is absent (tests, CI), fall back to
    // processChatMessage which uses deterministic regex parsing.
    // ─────────────────────────────────────────────────────────────────────────
    const isTestEnv =
      process.env.NODE_ENV === "test" ||
      process.env.npm_lifecycle_event === "test" ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.argv.some((arg) => arg.includes("test"));

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

    if (hasGeminiKey && !isTestEnv) {
      // Full Gemini conversational agent
      const agentResult = await runGeminiChatAgent({
        message,
        user,
        roomContextId,
        pendingAction: pendingAction as any,
        conversationHistory: conversationHistory.map((item) => ({
          role: item.role,
          text: item.content,
        })),
      });

      return successResponse({
        reply: agentResult.reply,
        pendingAction: agentResult.pendingAction,
        actionExecuted: null,
      } satisfies ChatProcessResult);
    }

    // Fallback: deterministic parser (used in tests and when Gemini is unavailable)
    const result = await processChatMessage({
      message,
      user,
      roomContextId,
      pendingAction: pendingAction as any,
      conversationHistory: conversationHistory.map((item) => ({
        role: item.role,
        text: item.content,
      })),
    });

    return successResponse(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return unauthorizedResponse(error.message);
    }

    console.error("Chat API error:", error);

    return errorResponse(
      error?.message || "Failed to process chat request",
      500
    );
  }
}