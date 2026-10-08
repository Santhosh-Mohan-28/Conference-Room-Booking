import crypto from "crypto";
import { prisma } from "./prisma";
import { sendOtpEmail } from "./email-service";

const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_15_MINUTES = 5;
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Derives a secure SHA-256 hash of the OTP and email using server secret
 */
function hashOtp(email: string, otp: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "enterprise-room-booking-otp-salt";
  return crypto
    .createHash("sha256")
    .update(`${email.toLowerCase()}:${otp}:${secret}`)
    .digest("hex");
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  retryAfterSeconds?: number;
}

export interface VerifyOtpResult {
  valid: boolean;
  error?: string;
}

/**
 * Generates a cryptographically random 6-digit OTP, stores its hash, and dispatches via email.
 */
export async function generateAndSendOtp(emailInput: string): Promise<SendOtpResult> {
  const email = emailInput.trim().toLowerCase();

  // 1. Rate Limiting Check: Cooldown (e.g., 60 seconds)
  const recentOtp = await prisma.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (recentOtp) {
    const elapsedSeconds = (Date.now() - recentOtp.createdAt.getTime()) / 1000;
    if (elapsedSeconds < OTP_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(OTP_COOLDOWN_SECONDS - elapsedSeconds);
      return {
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
        retryAfterSeconds: waitSeconds,
      };
    }
  }

  // 2. Rate Limiting Check: Max requests in window (15 minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentCount = await prisma.emailOtp.count({
    where: {
      email,
      createdAt: { gte: fifteenMinutesAgo },
    },
  });

  if (recentCount >= MAX_REQUESTS_PER_15_MINUTES) {
    return {
      success: false,
      message: "Too many verification requests. Please try again in 15 minutes.",
      retryAfterSeconds: 900,
    };
  }

  // 3. Invalidate previous active OTPs for this email
  await prisma.emailOtp.updateMany({
    where: {
      email,
      used: false,
      expiresAt: { gt: new Date() },
    },
    data: {
      used: true,
    },
  });

  // 4. Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(email, otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // 5. Save to database
  await prisma.emailOtp.create({
    data: {
      email,
      otpHash,
      expiresAt,
      attempts: 0,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
      used: false,
    },
  });

  // 6. Send via Email Service
  const emailDelivery = await sendOtpEmail({
    to: email,
    otp,
  });

  if (!emailDelivery.success) {
    console.error(`[OTP Service] Failed to send email to ${email}:`, emailDelivery.error);
    // Even if delivery failed, return error response so client knows
    return {
      success: false,
      message: "Failed to send verification email. Please verify your email configuration.",
    };
  }

  return {
    success: true,
    message: "A 6-digit verification code has been sent to your email address.",
  };
}

/**
 * Server-side verification of a supplied OTP against database records.
 * Handles single-use invalidation, expiration, and brute-force attempt limits.
 */
export async function verifyOtp(emailInput: string, otpInput: string): Promise<VerifyOtpResult> {
  const email = emailInput.trim().toLowerCase();
  const otp = otpInput.trim();

  if (!/^\d{6}$/.test(otp)) {
    return {
      valid: false,
      error: "Verification code must be exactly 6 digits.",
    };
  }

  // Find latest unused, non-expired OTP record for this email
  const record = await prisma.emailOtp.findFirst({
    where: {
      email,
      used: false,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return {
      valid: false,
      error: "No active verification code found. Please request a new one.",
    };
  }

  // Check if expired
  if (record.expiresAt < new Date()) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { used: true },
    });
    return {
      valid: false,
      error: "Verification code has expired. Please request a new code.",
    };
  }

  // Check if maximum attempts exceeded
  if (record.attempts >= record.maxAttempts) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { used: true },
    });
    return {
      valid: false,
      error: "Too many failed attempts. This code is now invalid. Please request a new one.",
    };
  }

  // Compare OTP hash using constant-time comparison
  const expectedHash = record.otpHash;
  const actualHash = hashOtp(email, otp);

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  const isMatch =
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer);

  if (!isMatch) {
    const updatedAttempts = record.attempts + 1;
    const isExhausted = updatedAttempts >= record.maxAttempts;

    await prisma.emailOtp.update({
      where: { id: record.id },
      data: {
        attempts: updatedAttempts,
        used: isExhausted,
      },
    });

    const remainingAttempts = record.maxAttempts - updatedAttempts;
    if (remainingAttempts <= 0) {
      return {
        valid: false,
        error: "Too many failed attempts. This code is now invalid. Please request a new one.",
      };
    }

    return {
      valid: false,
      error: `Incorrect verification code. ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} remaining.`,
    };
  }

  // Verification succeeded: invalidate the OTP to ensure single-use
  await prisma.emailOtp.update({
    where: { id: record.id },
    data: { used: true },
  });

  return { valid: true };
}
