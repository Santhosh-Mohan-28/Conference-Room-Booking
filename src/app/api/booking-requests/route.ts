import { NextRequest } from "next/server";
import { requireAuth, requireAdmin, AuthError } from "@/lib/auth";
import { bookingRequestCreateSchema } from "@/lib/validations";
import {
  createBookingRequest,
  getBookingRequests,
} from "@/lib/booking-request-service";
import { ConflictError, ValidationError, NotFoundError } from "@/lib/booking-service";
import {
  successResponse,
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
  conflictResponse,
  notFoundResponse,
} from "@/lib/api-response";
import { BookingRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/booking-requests
 * Restricted to administrators: retrieves all employee booking requests.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as BookingRequestStatus | undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const data = await getBookingRequests({
      status: status || undefined,
      search,
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
    console.error("GET /api/booking-requests error:", error);
    return errorResponse("Failed to retrieve booking requests", 500);
  }
}

/**
 * POST /api/booking-requests
 * Allows authenticated employees or admins to submit a booking request.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await req.json();
    const validated = bookingRequestCreateSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Validation failed", 400, validated.error.flatten());
    }

    const { roomId, title, description, startTime, endTime } = validated.data;

    const request = await createBookingRequest({
      requesterId: user.id,
      roomId,
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });

    return successResponse(request, 201);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return error.statusCode === 401
        ? unauthorizedResponse(error.message)
        : forbiddenResponse(error.message);
    }
    if (error instanceof ConflictError) {
      return conflictResponse(error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof NotFoundError) {
      return notFoundResponse(error.message);
    }

    console.error("POST /api/booking-requests error:", error);
    return errorResponse("Failed to create booking request", 500);
  }
}
