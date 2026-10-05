import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

const isDev = process.env.NODE_ENV !== "production";
const allowDevLogin = isDev && process.env.ENABLE_DEV_LOGIN === "true";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID || "common",
            profile(profile) {
              return {
                id: profile.oid || profile.sub,
                name: profile.name,
                email: profile.email || profile.preferred_username,
                role: "EMPLOYEE", // Will be resolved against DB in signIn callback
              };
            },
          }),
        ]
      : []),

    // Strictly isolated development login provider (disabled in production)
    ...(allowDevLogin
      ? [
          CredentialsProvider({
            id: "dev-mock-login",
            name: "Enterprise Dev Switch",
            credentials: {
              email: { label: "Email", type: "email" },
              role: { label: "Role", type: "text" },
            },
            async authorize(credentials) {
              if (!credentials?.email) return null;

              const email = credentials.email.toLowerCase().trim();
              const requestedRole = credentials.role === "ADMIN" ? "ADMIN" : "EMPLOYEE";

              // Find or create the user in the database
              let user = await prisma.user.findUnique({
                where: { email },
              });

              if (!user) {
                // Determine initial role: only assign ADMIN if explicitly configured
                const isAdminConfigured =
                  email === (process.env.INITIAL_ADMIN_EMAIL || "").toLowerCase();
                const initialRole = isAdminConfigured ? "ADMIN" : requestedRole;

                user = await prisma.user.create({
                  data: {
                    email,
                    name:
                      initialRole === "ADMIN"
                        ? "Enterprise Administrator"
                        : "Company Employee",
                    role: initialRole,
                    microsoftUserId: `dev-ms-${email}`,
                    microsoftTenantId: process.env.AZURE_AD_TENANT_ID || "dev-tenant-id",
                    isActive: true,
                  },
                });
              }

              if (!user.isActive) {
                throw new Error("This employee account has been deactivated.");
              }

              return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                microsoftUserId: user.microsoftUserId,
                microsoftTenantId: user.microsoftTenantId,
              };
            },
          }),
        ]
      : []),
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
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      // Handle Microsoft Entra ID OAuth sign in
      if (account?.provider === "azure-ad") {
        const configuredTenant = process.env.AZURE_AD_TENANT_ID;
        const profileTenant = (profile as any)?.tid;

        // Verify that the account belongs to the configured company Microsoft Entra tenant
        if (configuredTenant && configuredTenant !== "common" && profileTenant) {
          if (configuredTenant !== profileTenant) {
            console.error(
              `Tenant mismatch: expected ${configuredTenant}, received ${profileTenant}`
            );
            return false;
          }
        }

        const msUserId = (profile as any)?.oid || (profile as any)?.sub;
        const initialAdminMsId = process.env.INITIAL_ADMIN_MICROSOFT_ID;
        const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || "").toLowerCase();

        // Find or provision user in DB
        let dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { microsoftUserId: msUserId },
              { email: user.email.toLowerCase() },
            ],
          },
        });

        if (!dbUser) {
          // Provision new user. New users receive EMPLOYEE role unless explicitly matching configured initial admin
          const shouldBeAdmin =
            (initialAdminMsId && msUserId === initialAdminMsId) ||
            (initialAdminEmail && user.email.toLowerCase() === initialAdminEmail);

          dbUser = await prisma.user.create({
            data: {
              email: user.email.toLowerCase(),
              name: user.name || "Enterprise User",
              microsoftUserId: msUserId,
              microsoftTenantId: profileTenant || configuredTenant,
              role: shouldBeAdmin ? "ADMIN" : "EMPLOYEE",
              isActive: true,
            },
          });
        } else {
          // Update Microsoft ID/Tenant ID if missing
          if (!dbUser.microsoftUserId && msUserId) {
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                microsoftUserId: msUserId,
                microsoftTenantId: profileTenant || configuredTenant,
              },
            });
          }
        }

        if (!dbUser.isActive) {
          console.warn(`Deactivated user ${user.email} attempted login.`);
          return false;
        }

        // Attach database attributes to user
        user.id = dbUser.id;
        (user as any).role = dbUser.role;
        (user as any).microsoftUserId = dbUser.microsoftUserId;
        (user as any).microsoftTenantId = dbUser.microsoftTenantId;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.microsoftUserId = (user as any).microsoftUserId;
        token.microsoftTenantId = (user as any).microsoftTenantId;
      }

      // Periodically refresh role from DB in case an admin changed it
      if (token.id) {
        try {
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, isActive: true },
          });
          if (freshUser) {
            token.role = freshUser.role;
            token.isActive = freshUser.isActive;
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
        (session.user as any).microsoftUserId = token.microsoftUserId;
        (session.user as any).microsoftTenantId = token.microsoftTenantId;
        (session.user as any).isActive = token.isActive ?? true;
      }
      return session;
    },
  },
};
