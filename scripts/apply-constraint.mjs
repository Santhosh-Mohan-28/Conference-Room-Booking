import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function applyExclusionConstraint() {
  console.log("Applying PostgreSQL exclusion constraint on Booking table...");
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);
    console.log("btree_gist extension ensured.");

    const check = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint WHERE conname = 'no_overlapping_confirmed_bookings';
    `);

    if (Array.isArray(check) && check.length === 0) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Booking" 
        ADD CONSTRAINT "no_overlapping_confirmed_bookings" 
        EXCLUDE USING gist (
          "roomId" WITH =,
          tsrange("startTime", "endTime") WITH &&
        ) 
        WHERE (status = 'CONFIRMED');
      `);
      console.log("Successfully created exclusion constraint: no_overlapping_confirmed_bookings");
    } else {
      console.log("Exclusion constraint already exists.");
    }
  } catch (err) {
    console.error("Error applying exclusion constraint:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyExclusionConstraint();
