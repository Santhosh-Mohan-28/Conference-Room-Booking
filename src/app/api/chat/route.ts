import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validations";
import { processChatMessage } from "@/lib/chatbot-service";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";

/**
 * POST /api/chat
 * Natural-language assistant endpoint for conference room booking & requests.
 * Uses authenticated session role to enforce server-side business rules.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await req.json();
    const validated = chatRequestSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid chat request", 400, validated.error.flatten());
    }

    const { message, roomContextId, pendingAction } = validated.data;

    const result = await processChatMessage({
      message,
      user,
      roomContextId,
      pendingAction: pendingAction as any,
    });

    return successResponse(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return unauthorizedResponse(error.message);
    }
    console.error("POST /api/chat error:", error);
    return errorResponse("Failed to process message", 500);
  }
}
