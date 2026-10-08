import { NextRequest } from "next/server";
import { otpSendSchema } from "@/lib/validations";
import { generateAndSendOtp } from "@/lib/otp-service";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * POST /api/auth/otp/send
 * Public endpoint to request a 6-digit email OTP for authentication.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = otpSendSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse("Invalid email address", 400, validated.error.flatten());
    }

    const { email } = validated.data;
    const result = await generateAndSendOtp(email);

    if (!result.success) {
      const status = result.retryAfterSeconds ? 429 : 400;
      return errorResponse(result.message, status, {
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return successResponse({
      message: result.message,
      email,
    });
  } catch (error: any) {
    console.error("POST /api/auth/otp/send error:", error);
    return errorResponse(
      error?.message || "Failed to dispatch verification code. Please try again.",
      500
    );
  }
}
