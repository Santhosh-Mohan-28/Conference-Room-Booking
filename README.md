# Enterprise Conference Room Booking System

A complete, production-ready, full-stack enterprise web application built with **Next.js (App Router)**, **TypeScript**, **PostgreSQL**, **Prisma ORM**, and **Tailwind CSS**.

The system enables internal company employees to browse conference rooms, inspect hardware amenities, and monitor live room availability calendars in the company time zone (**Asia/Kolkata**). All room booking, reservation modification, cancellation, and conference room provisioning is strictly restricted to authorized **Administrators**, protected both by server-side authorization and database-level exclusion constraints preventing double bookings.

---

## 🚀 Key Features

### 1. Role-Based Access Control (RBAC)
- **ADMIN**:
  - Full room management: add rooms, edit specifications, deactivate rooms, reactivate rooms, and safe deletion.
  - Full booking management: reserve conference rooms, update meeting details, cancel reservations (with history preservation).
  - Administrative dashboard with real-time room occupancy and scheduled bookings.
  - Complete administrative audit logging for all room and booking actions.
- **EMPLOYEE**:
  - View all active conference rooms and equipment specifications.
  - Interactive live room availability calendar across Daily, Weekly, and Monthly views.
  - Employee dashboard showing today's schedule and upcoming room reservations.
  - Administrative actions and APIs are hidden from the UI and strictly rejected with HTTP 403 on the server.

### 2. Double-Booking Prevention & Concurrency Protection
- **Application Level**: Validates slot availability in a serializable database transaction using the overlap formula:
  $$\text{existing.startTime} < \text{requested.endTime} \quad \text{AND} \quad \text{existing.endTime} > \text{requested.startTime}$$
- **PostgreSQL Database Level**: Enforces atomic conflict prevention via a PostgreSQL `EXCLUDE USING gist` constraint utilizing the `btree_gist` extension:
  ```sql
  ALTER TABLE "Booking" 
  ADD CONSTRAINT "no_overlapping_confirmed_bookings" 
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  ) 
  WHERE (status = 'CONFIRMED');
  ```
- **Adjacent Bookings**: Permitted without conflict (e.g., 10:00–11:00 AM and 11:00 AM–12:00 PM).
- **Cancelled Bookings**: Re-opens slot immediately while preserving audit and reservation history.
- **Race Condition Immunity**: Even when two administrators simultaneously attempt to book the exact same millisecond slot, the PostgreSQL exclusion constraint guarantees exactly one succeeds while rejecting the other with a graceful HTTP 409 conflict message.

### 3. Safe Room Management & Referential Integrity
- **Deactivation**: Deactivated rooms remain in the database, retain their historical bookings, but are removed from employee listings and reject any new booking attempts.
- **Pre-Deactivation Safety Guard**: If a room has future confirmed reservations, the system blocks deactivation until those bookings are cancelled or relocated.
- **Safe Deletion**: Rooms with existing booking history cannot be permanently deleted (ensuring audit and foreign key integrity) and must be deactivated instead.

### 4. Enterprise Microsoft Entra ID Authentication
- OAuth 2.0 / OpenID Connect via Auth.js / NextAuth.
- Validates Microsoft Entra tenant ID (`AZURE_AD_TENANT_ID`) and immutable Microsoft User ID (`oid` / `sub`).
- **Initial Administrator Provisioning**: Configured securely via `INITIAL_ADMIN_MICROSOFT_ID` or `INITIAL_ADMIN_EMAIL`. First-time logins receive the `EMPLOYEE` role by default unless explicitly configured as an administrator.
- **Local Dev Switch**: Strictly isolated to development (`NODE_ENV !== 'production'`), providing 1-click test administrator (`admin@enterprise.com`) and test employee (`employee@enterprise.com`) access.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide React icons.
- **Backend**: Next.js Server-side Route Handlers, TypeScript, RESTful API architecture, Zod validation.
- **Database**: PostgreSQL with Prisma ORM and custom migrations for `btree_gist` exclusion constraints.
- **Authentication**: NextAuth (Auth.js) with Microsoft Entra ID (Azure AD) provider and HTTP-only session cookies.
- **Time Zone**: Stored consistently in UTC; parsed and rendered in `Asia/Kolkata` (configurable via `COMPANY_TIMEZONE`).

---

## 📁 Project Architecture

```
conference-room-booking/
├── prisma/
│   ├── schema.prisma                       # Database models: User, Room, Booking, AuditLog
│   └── migrations/
│       └── 20261005000000_init/
│           └── migration.sql               # Base tables + btree_gist exclusion constraint
├── scripts/
│   ├── seed.mjs                            # Sample rooms & explicit admin provisioning
│   ├── apply-constraint.mjs                # Script applying PostgreSQL exclusion constraint
│   └── start-wsl-postgres.sh               # Local resilient PostgreSQL service runner
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts # NextAuth catch-all OAuth endpoint
│   │   │   ├── rooms/route.ts              # GET /api/rooms, POST /api/rooms
│   │   │   ├── rooms/[id]/route.ts         # GET, PATCH, DELETE /api/rooms/:id
│   │   │   ├── bookings/route.ts           # GET /api/bookings, POST /api/bookings
│   │   │   ├── bookings/[id]/route.ts      # GET, PATCH /api/bookings/:id
│   │   │   ├── bookings/[id]/cancel/route.ts # POST /api/bookings/:id/cancel
│   │   │   ├── availability/route.ts       # GET /api/availability
│   │   │   ├── dashboard/route.ts          # GET /api/dashboard
│   │   │   ├── audit-logs/route.ts         # GET /api/audit-logs
│   │   │   └── me/route.ts                 # GET /api/me
│   │   ├── login/page.tsx                  # Corporate login with Microsoft & Dev switch
│   │   ├── dashboard/page.tsx              # Role-aware dashboard
│   │   ├── rooms/page.tsx                  # Rooms directory with search and filter
│   │   ├── rooms/new/page.tsx              # Add Room (Admin only)
│   │   ├── rooms/[id]/page.tsx             # Room Details
│   │   ├── rooms/[id]/edit/page.tsx        # Edit Room (Admin only)
│   │   ├── availability/page.tsx           # Availability calendar (Daily/Weekly/Monthly)
│   │   ├── bookings/page.tsx               # Manage Bookings (Admin only)
│   │   ├── bookings/new/page.tsx           # Book Conference Room (Admin only)
│   │   ├── profile/page.tsx                # User Profile & immutable role info
│   │   ├── audit-logs/page.tsx             # Audit Logs viewer (Admin only)
│   │   ├── layout.tsx                      # Root layout
│   │   ├── page.tsx                        # Root redirect
│   │   └── globals.css                     # Tailwind & scrollbars
│   ├── components/
│   │   ├── AppLayout.tsx                   # Main layout container
│   │   ├── Navbar.tsx                      # Topbar with profile & IST timezone
│   │   ├── Sidebar.tsx                     # Responsive role-adaptive navigation
│   │   ├── RoomCard.tsx                    # Conference room cards
│   │   ├── CalendarView.tsx                # Interactive timeline calendar
│   │   ├── ConfirmDialog.tsx               # Modal confirmation dialog
│   │   ├── Toast.tsx                       # Global toast provider & hooks
│   │   └── Providers.tsx                   # NextAuth & Toast root wrapper
│   ├── lib/
│   │   ├── prisma.ts                       # Prisma Client singleton
│   │   ├── auth.ts                         # Server-side auth & requireAdmin() guards
│   │   ├── auth-config.ts                  # NextAuth Entra ID & session configuration
│   │   ├── booking-service.ts              # Double-booking check & transaction logic
│   │   ├── audit-service.ts                # PostgreSQL audit log generator
│   │   ├── timezone.ts                     # Company timezone (Asia/Kolkata) formatting
│   │   ├── validations.ts                  # Zod validation schemas
│   │   └── api-response.ts                 # Standardized JSON response helpers
│   └── types/
│       └── index.ts                        # Shared TypeScript interfaces
├── tests/
│   └── booking-system.test.ts              # 20 automated tests for RBAC, double-booking, etc.
├── .env.example                            # Configuration template
├── package.json
└── tsconfig.json
```

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://user:pass@localhost:5432/postgres` |
| `NEXTAUTH_URL` | Base URL of the application | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | 32-byte secret for JWT session encryption | Random 32-character string |
| `AZURE_AD_CLIENT_ID` | Application (client) ID from Azure Portal | `00000000-0000-0000-0000-000000000000` |
| `AZURE_AD_CLIENT_SECRET` | Client secret value from Azure Portal | Entra ID Client Secret |
| `AZURE_AD_TENANT_ID` | Directory (tenant) ID from Azure Portal | `00000000-0000-0000-0000-000000000000` |
| `INITIAL_ADMIN_MICROSOFT_ID` | Microsoft User OID of initial Administrator | `00000000-0000-0000-0000-000000000000` |
| `INITIAL_ADMIN_EMAIL` | Corporate email of initial Administrator | `admin@enterprise.com` |
| `COMPANY_TIMEZONE` | IANA timezone identifier | `Asia/Kolkata` |
| `ENABLE_DEV_LOGIN` | Enable mock role switch in local development | `true` (dev) / `false` (prod) |

---

## 🏢 Microsoft Entra ID Setup Guide

1. Sign in to the [Azure Portal](https://portal.azure.com/) as an administrator.
2. Navigate to **Microsoft Entra ID** > **App registrations** > **New registration**.
3. Configure the application:
   - **Name**: `Conference Room Booking System`
   - **Supported account types**: Accounts in this organizational directory only (Single tenant).
   - **Redirect URI**: Select **Web** and set `https://<your-domain>/api/auth/callback/azure-ad` (or `http://localhost:3000/api/auth/callback/azure-ad` for local testing).
4. Under **Certificates & secrets**, create a **New client secret** and copy the value to `AZURE_AD_CLIENT_SECRET`.
5. Under **Overview**, copy the **Application (client) ID** to `AZURE_AD_CLIENT_ID` and **Directory (tenant) ID** to `AZURE_AD_TENANT_ID`.
6. Under **API permissions**, grant `User.Read` (delegated) permission.
7. To provision the first administrator, copy the user's **Object ID** from Microsoft Entra ID into `INITIAL_ADMIN_MICROSOFT_ID` and email into `INITIAL_ADMIN_EMAIL`.

---

## 💻 Local Development

### Prerequisites
- Node.js 18+ (tested on Node v24)
- PostgreSQL database running (or WSL/Docker)

### 1. Install Dependencies
```bash
npm install
```

### 2. Push Database Schema & Apply Exclusion Constraint
```bash
npm run db:push
node scripts/apply-constraint.mjs
```

### 3. Seed Conference Rooms & Administrator
```bash
npm run db:seed
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Testing Scenarios

Run the complete test suite:
```bash
npm test
```

All 20 mission-critical scenarios are covered:
1. Administrator can create a conference room.
2. Administrator can edit a conference room.
3. Administrator can deactivate a conference room.
4. Administrator can reactivate a conference room.
5. Employee role verification denies room modification (HTTP 403).
6. Employee role verification denies booking creation (HTTP 403).
7. Administrator can create a valid booking.
8. Overlapping bookings are rejected (HTTP 409 Conflict).
9. Adjacent bookings are accepted without conflict.
10. Cancelled bookings do not block availability.
11. Booking edits cannot introduce scheduling conflicts.
12. Simultaneous conflicting booking attempts cannot both succeed (PostgreSQL exclusion constraint test).
13. Inactive rooms cannot be booked.
14. Historical bookings remain intact after room deactivation.
15. Unauthenticated users cannot access protected endpoints (HTTP 401).
16. Users cannot modify their own application roles.
17. Deleting a room with historical bookings is blocked.
18. Bookings that cross midnight are supported when end time is later than start time.
19. Timezone conversion maps IST to UTC accurately.
20. Audit logging records administrative operations.

---

## 🚀 Production Deployment (Vercel & Managed PostgreSQL)

1. Provision a managed PostgreSQL instance with `btree_gist` extension support (e.g., Neon, Supabase, AWS RDS, Azure Database for PostgreSQL, or Google Cloud SQL).
2. Deploy the application to Vercel:
   - Connect the repository.
   - Configure Environment Variables in the Vercel Project Settings (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `INITIAL_ADMIN_EMAIL`, `ENABLE_DEV_LOGIN=false`).
   - Run database migrations:
     ```bash
     npx prisma db push
     node scripts/apply-constraint.mjs
     node scripts/seed.mjs
     ```
3. Update the Microsoft Entra ID redirect URI in Azure Portal to include your production Vercel domain:
   `https://<your-vercel-domain>/api/auth/callback/azure-ad`
4. The application is now live and fully operational for enterprise deployment!
