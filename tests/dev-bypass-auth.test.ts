import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "../src/lib/auth-config";

const prisma = new PrismaClient();

describe("Development Authentication Bypass - Automated Test Suite", () => {
  const newEmail1 = "testemployee1@company.com";
  const newEmail2 = "testemployee2@company.com";
  const existingAdminEmail = "real-admin-user@company.com";
  const inactiveEmail = "inactive-user@company.com";
  const superAdminEmail = "santhoshmohan0905@gmail.com";

  // Helper to find the dev-email-login provider and return its authorize function.
  //
  // IMPORTANT - NextAuth internals:
  //   CredentialsProvider always sets the top-level `id` to "credentials" and the
  //   top-level `authorize` to a no-op `() => null`.
  //   The user-supplied values (custom id, real authorize function) are stored under
  //   `provider.options`. We look up by `options.id` and call `options.authorize`.
  function getDevProvider() {
    const provider = authOptions.providers.find(
      (p: any) => p.options?.id === "dev-email-login"
    ) as any;
    assert.ok(provider, "dev-email-login provider should be registered");
    // Return a thin wrapper that calls the real authorize function
    return {
      authorize: (credentials: any) => provider.options.authorize(credentials),
    };
  }

  before(async () => {
    // Clean up test emails
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [newEmail1, newEmail2, existingAdminEmail, inactiveEmail],
        },
      },
    });

    // Create existing Admin account
    await prisma.user.create({
      data: {
        email: existingAdminEmail,
        name: "Existing Admin",
        role: "ADMIN",
        isActive: true,
      },
    });

    // Create existing Inactive user
    await prisma.user.create({
      data: {
        email: inactiveEmail,
        name: "Inactive Employee",
        role: "EMPLOYEE",
        isActive: false,
      },
    });
  });

  after(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [newEmail1, newEmail2, existingAdminEmail, inactiveEmail],
        },
      },
    });
    await prisma.$disconnect();
  });

  // TEST 1: New email -> creates exactly 1 User record, role = EMPLOYEE, isActive = true
  it("TEST 1: New email creates exactly one User record with role EMPLOYEE and isActive true", async () => {
    const provider = getDevProvider();
    const userSession = await provider.authorize({ email: newEmail1 });

    assert.ok(userSession, "Should return user session object");
    assert.equal(userSession.email, newEmail1);
    assert.equal(userSession.role, "EMPLOYEE");
    assert.equal(userSession.isActive, true);

    const dbUsers = await prisma.user.findMany({
      where: { email: newEmail1 },
    });
    assert.equal(dbUsers.length, 1, "Exactly one record must be created");
    assert.equal(dbUsers[0].role, "EMPLOYEE");
    assert.equal(dbUsers[0].isActive, true);
  });

  // TEST 2: Second login with same email -> does not duplicate, role remains EMPLOYEE
  it("TEST 2: Second login with same email uses existing record and does not create duplicate", async () => {
    const provider = getDevProvider();
    const userSession = await provider.authorize({ email: newEmail1 });

    assert.ok(userSession);
    assert.equal(userSession.email, newEmail1);
    assert.equal(userSession.role, "EMPLOYEE");

    const dbUsers = await prisma.user.findMany({
      where: { email: newEmail1 },
    });
    assert.equal(dbUsers.length, 1, "No duplicate records created");
  });

  // TEST 3: Login with another email -> creates separate User record
  it("TEST 3: Login with another email creates a distinct User record with role EMPLOYEE", async () => {
    const provider = getDevProvider();
    const userSession = await provider.authorize({ email: newEmail2 });

    assert.ok(userSession);
    assert.equal(userSession.email, newEmail2);
    assert.equal(userSession.role, "EMPLOYEE");

    const count = await prisma.user.count({
      where: { email: { in: [newEmail1, newEmail2] } },
    });
    assert.equal(count, 2, "Both distinct emails exist as separate users");
  });

  // TEST 4: Existing ADMIN account -> role remains ADMIN
  it("TEST 4: Existing ADMIN user logs in and retains ADMIN role without reset", async () => {
    const provider = getDevProvider();
    const userSession = await provider.authorize({ email: existingAdminEmail });

    assert.ok(userSession);
    assert.equal(userSession.email, existingAdminEmail);
    assert.equal(userSession.role, "ADMIN");

    const dbUser = await prisma.user.findUnique({
      where: { email: existingAdminEmail },
    });
    assert.equal(dbUser?.role, "ADMIN", "Role in database must remain ADMIN");
  });

  // TEST 5: Existing inactive user -> rejected, not reactivated
  it("TEST 5: Existing inactive user login is rejected and user remains inactive", async () => {
    const provider = getDevProvider();

    await assert.rejects(
      async () => {
        await provider.authorize({ email: inactiveEmail });
      },
      (err: any) => {
        assert.match(err.message, /deactivated/i);
        return true;
      }
    );

    const dbUser = await prisma.user.findUnique({
      where: { email: inactiveEmail },
    });
    assert.equal(dbUser?.isActive, false, "Inactive user must NOT be automatically reactivated");
  });

  // TEST 6: Super Admin account -> logs in with isSuperAdmin: true
  it("TEST 6: Super Admin logs in with full Super Admin privileges and ADMIN role", async () => {
    const provider = getDevProvider();
    const userSession = await provider.authorize({ email: superAdminEmail });

    assert.ok(userSession);
    assert.equal(userSession.email, superAdminEmail);
    assert.equal(userSession.role, "ADMIN");
    assert.equal(userSession.isSuperAdmin, true);
  });

  // TEST 7: Invalid email formats are rejected
  it("TEST 7: Rejects empty or invalid email formats", async () => {
    const provider = getDevProvider();

    await assert.rejects(
      async () => {
        await provider.authorize({ email: "" });
      },
      (err: any) => {
        assert.match(err.message, /required/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await provider.authorize({ email: "notanemail" });
      },
      (err: any) => {
        assert.match(err.message, /valid/i);
        return true;
      }
    );
  });

  // TEST 8: Production Safety Guard
  it("TEST 8: Production safety guard rejects bypass when NODE_ENV === 'production'", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const provider = getDevProvider();

      await assert.rejects(
        async () => {
          await provider.authorize({ email: "any@company.com" });
        },
        (err: any) => {
          assert.match(err.message, /not permitted in production/i);
          return true;
        }
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
