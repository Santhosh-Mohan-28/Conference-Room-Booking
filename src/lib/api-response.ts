import { NextResponse } from "next/server";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

export function errorResponse(message: string, status = 400, details: any = null) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      details,
    },
    { status }
  );
}

export function unauthorizedResponse(message = "Authentication required. Please sign in.") {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message = "Access denied: Administrator privileges required.") {
  return errorResponse(message, 403);
}

export function notFoundResponse(message = "Requested resource not found.") {
  return errorResponse(message, 404);
}

export function conflictResponse(
  message = "Booking conflict: Selected time overlaps with an existing reservation."
) {
  return errorResponse(message, 409);
}
