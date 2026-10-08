import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { isSuperAdmin } from "./super-admin";
import { verifyOtp } from "./otp-service";
import { otpVerifySchema } from "./validations";

/**
 * Resolves an existing user or creates exactly one new user record.
 * - If user does not exist: creates new user with role EMPLOYEE (or ADMIN if in SUPER_ADMIN_EMAILS) and isActive: true.
 * - If user already exists: strictly preserves existing role and active status.
 * - If user is inactive: rejects login.
 */
async function resolveOrCreateUser(cleanEmail: string) {
  const userIsSuperAdmin = isSuperAdmin(cleanEmail);
  let user = await prisma.user.findUnique({
    where: { email: cleanEmail },
  });

  if (!user) {
    // New User Provisioning:
    // If in SUPER_ADMIN_EMAILS -> initial role is ADMIN, active: true
    // Normal users -> strictly EMPLOYEE role, active: true
    const initialRole = userIsSuperAdmin ? "ADMIN" : "EMPLOYEE";
    const formattedName =
      cleanEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
      "Corporate User";

    user = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: userIsSuperAdmin ? "Super Administrator" : formattedName,
        role: initialRole,
        isActive: true,
      },
    });
  } else {
    // Existing user: preserve database role and active status
    if (!user.isActive) {
      throw new Error("Your account has been deactivated. Please contact an administrator.");
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isSuperAdmin: userIsSuperAdmin,
  };
}

// NOTE: dev-email-login is always registered in the providers array.
// The authorize function enforces runtime guards: it throws immediately when
// NODE_ENV === "production" or DEV_BYPASS_AUTH !== "true".
// Keeping the provider always registered allows tests to access and call authorize()
// to verify both the happy-path behavior and the production-safety guard.

export const authOptions: NextAuthOptions = {
  providers: [
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Development Login Bypass Provider
    // Always registered. authorize() enforces guards at runtime:
    //   - Rejects if NODE_ENV === "production"
    //   - Rejects if DEV_BYPASS_AUTH !== "true"
    // This means it is functionally disabled in production even though it is
    // present in the array.
    // ─────────────────────────────────────────────────────────────────────────
    CredentialsProvider({
      id: "dev-email-login",
      name: "Development Email Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        // Runtime production-safety guard — must be first
        if (
          process.env.NODE_ENV === "production" ||
          process.env.DEV_BYPASS_AUTH !== "true"
        ) {
          throw new Error("Development authentication bypass is not permitted in production.");
        }

        if (!credentials?.email) {
          throw new Error("Email address is required.");
        }

        const cleanEmail = credentials.email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes("@")) {
          throw new Error("Please enter a valid corporate email address.");
        }

        return await resolveOrCreateUser(cleanEmail);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Production / Standard Email OTP Provider
    // Always preserved in codebase for production or when DEV_BYPASS_AUTH is false
    // ─────────────────────────────────────────────────────────────────────────
    CredentialsProvider({
      id: "email-otp",
      name: "Email OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) {
          throw new Error("Both email and 6-digit verification code are required.");
        }

        const validated = otpVerifySchema.safeParse({
          email: credentials.email,
          otp: credentials.otp,
        });

        if (!validated.success) {
          throw new Error("Please provide a valid company email and a 6-digit code.");
        }

        const { email, otp } = validated.data;

        // Verify OTP server-side
        const verification = await verifyOtp(email, otp);
        if (!verification.valid) {
          throw new Error(verification.error || "Invalid verification code.");
        }

        // Resolve or provision user
        return await resolveOrCreateUser(email);
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours corporate session
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isSuperAdmin = (user as any).isSuperAdmin ?? isSuperAdmin(user.email);
        token.isActive = (user as any).isActive ?? true;
      }

      // Periodically refresh role and active status from DB
      if (token.id) {
        try {
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { email: true, role: true, isActive: true },
          });
          if (freshUser) {
            token.role = freshUser.role;
            token.isActive = freshUser.isActive;
            token.isSuperAdmin = isSuperAdmin(freshUser.email);
          }
        } catch (e) {
          // ignore transient DB query issues during token cycle
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).isSuperAdmin = token.isSuperAdmin ?? isSuperAdmin(session.user.email);
        (session.user as any).isActive = token.isActive ?? true;
      }
      return session;
    },
  },
};
