import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Booking' AND column_name IN ('startTime', 'endTime');
  `);
  console.log("Columns:", cols);
  await prisma.$disconnect();
}

check();
