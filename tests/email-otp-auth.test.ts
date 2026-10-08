import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { generateAndSendOtp, verifyOtp } from "../src/lib/otp-service";
import crypto from "crypto";

const prisma = new PrismaClient();

describe("Passwordless Email + OTP Authentication System - Test Suite", () => {
  const testEmail = "auth-tester@enterprise.com";
  const rateLimitEmail = "ratelimit-tester@enterprise.com";

  before(async () => {
    // Clean up any existing OTPs for test emails
    await prisma.emailOtp.deleteMany({
      where: { email: { in: [testEmail, rateLimitEmail] } },
    });
  });

  after(async () => {
    await prisma.emailOtp.deleteMany({
      where: { email: { in: [testEmail, rateLimitEmail] } },
    });
    await prisma.$disconnect();
  });

  it("1. Generates 6-digit OTP, stores secure hash, and dispatches via email service", async () => {
    const res = await generateAndSendOtp(testEmail);
    assert.equal(res.success, true);
    assert.ok(res.message);

    const record = await prisma.emailOtp.findFirst({
      where: { email: testEmail, used: false },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(record, "OTP record should exist in database");
    assert.equal(record.used, false);
    assert.equal(record.attempts, 0);
    assert.equal(record.maxAttempts, 5);
    // OTP hash is a 64-char hex string (SHA-256)
    assert.equal(record.otpHash.length, 64);
    // Expiration is in the future (~5 minutes)
    const diffMs = record.expiresAt.getTime() - record.createdAt.getTime();
    assert.ok(diffMs >= 290000 && diffMs <= 310000, "Should expire in approximately 5 minutes");
  });

  it("2. Enforces 60-second cooldown rate limit on immediate consecutive requests", async () => {
    const firstRes = await generateAndSendOtp(rateLimitEmail);
    assert.equal(firstRes.success, true);

    // Immediate second request
    const secondRes = await generateAndSendOtp(rateLimitEmail);
    assert.equal(secondRes.success, false);
    assert.ok(secondRes.retryAfterSeconds! > 0, "Should return cooldown wait time");
    assert.match(secondRes.message, /wait \d+ seconds/i);
  });

  it("3. Rejects invalid OTP with informative error and increments attempt counter", async () => {
    const recordBefore = await prisma.emailOtp.findFirst({
      where: { email: testEmail, used: false },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(recordBefore);

    const verifyResult = await verifyOtp(testEmail, "000000");
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.error!, /Incorrect verification code/i);

    const recordAfter = await prisma.emailOtp.findUnique({
      where: { id: recordBefore.id },
    });
    assert.equal(recordAfter?.attempts, 1);
    assert.equal(recordAfter?.used, false);
  });

  it("4. Rejects non-6-digit OTP formats immediately", async () => {
    const verifyResult = await verifyOtp(testEmail, "123");
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.error!, /6 digits/i);
  });

  it("5. Successfully verifies correct OTP and marks record as used (single-use)", async () => {
    // Generate a known OTP record directly for precise verification
    const knownOtp = "789123";
    const secret = process.env.NEXTAUTH_SECRET || "enterprise-room-booking-otp-salt";
    const knownHash = crypto
      .createHash("sha256")
      .update(`${testEmail.toLowerCase()}:${knownOtp}:${secret}`)
      .digest("hex");

    const created = await prisma.emailOtp.create({
      data: {
        email: testEmail,
        otpHash: knownHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        maxAttempts: 5,
        used: false,
      },
    });

    const verifyResult = await verifyOtp(testEmail, knownOtp);
    assert.equal(verifyResult.valid, true);

    // Verify it is now marked used
    const updated = await prisma.emailOtp.findUnique({
      where: { id: created.id },
    });
    assert.equal(updated?.used, true, "Record should be invalidated after successful use");

    // Second attempt with same code must fail (single-use enforcement)
    const reuseResult = await verifyOtp(testEmail, knownOtp);
    assert.equal(reuseResult.valid, false);
  });

  it("6. Rejects expired OTP and marks it used", async () => {
    const expiredOtp = "654321";
    const secret = process.env.NEXTAUTH_SECRET || "enterprise-room-booking-otp-salt";
    const expiredHash = crypto
      .createHash("sha256")
      .update(`${testEmail.toLowerCase()}:${expiredOtp}:${secret}`)
      .digest("hex");

    const created = await prisma.emailOtp.create({
      data: {
        email: testEmail,
        otpHash: expiredHash,
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
        attempts: 0,
        maxAttempts: 5,
        used: false,
      },
    });

    const verifyResult = await verifyOtp(testEmail, expiredOtp);
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.error!, /expired/i);

    const updated = await prisma.emailOtp.findUnique({
      where: { id: created.id },
    });
    assert.equal(updated?.used, true);
  });

  it("7. Blocks verification after exceeding maximum allowed attempts (5 attempts)", async () => {
    const bruteForceOtp = "112233";
    const secret = process.env.NEXTAUTH_SECRET || "enterprise-room-booking-otp-salt";
    const bruteHash = crypto
      .createHash("sha256")
      .update(`${testEmail.toLowerCase()}:${bruteForceOtp}:${secret}`)
      .digest("hex");

    const record = await prisma.emailOtp.create({
      data: {
        email: testEmail,
        otpHash: bruteHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 4, // 4 failed attempts already
        maxAttempts: 5,
        used: false,
      },
    });

    // 5th failed attempt -> exhausts allowed attempts
    const fifthResult = await verifyOtp(testEmail, "999999");
    assert.equal(fifthResult.valid, false);
    assert.match(fifthResult.error!, /Too many failed attempts/i);

    const updated = await prisma.emailOtp.findUnique({
      where: { id: record.id },
    });
    assert.equal(updated?.attempts, 5);
    assert.equal(updated?.used, true);

    // Any subsequent attempt with the real OTP is rejected because code is invalidated
    const subsequentResult = await verifyOtp(testEmail, bruteForceOtp);
    assert.equal(subsequentResult.valid, false);
  });
});
