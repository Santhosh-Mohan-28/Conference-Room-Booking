import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { getUserBookingRequests } from "@/lib/booking-request-service";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/api-response";
import { BookingRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/booking-requests/my
 * Retrieves the authenticated user's submitted booking requests.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as BookingRequestStatus | undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const data = await getUserBookingRequests({
      userId: user.id,
      status: status || undefined,
      page,
      limit,
    });

    return successResponse(data);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    console.error("GET /api/booking-requests/my error:", error);
    return errorResponse("Failed to retrieve user booking requests", 500);
  }
}
