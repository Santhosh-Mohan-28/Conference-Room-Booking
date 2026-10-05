import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sampleRooms = [
  {
    roomCode: "BLR-01-A",
    name: "Aryabhata Boardroom",
    building: "Tower A (Main Campus)",
    floor: 1,
    capacity: 20,
    description: "Executive boardroom equipped with 4K dual display video conferencing, spatial audio microphones, and interactive digital whiteboard.",
    equipment: ["Video conferencing", "Television", "Microphone", "Speakers", "Whiteboard", "Conference phone"],
    isActive: true,
  },
  {
    roomCode: "BLR-02-B",
    name: "Ramanujan Innovation Lab",
    building: "Tower A (Main Campus)",
    floor: 2,
    capacity: 12,
    description: "Collaborative design and sprint planning room with dual writeable glass walls and ultra-wide conferencing bar.",
    equipment: ["Video conferencing", "Whiteboard", "Television", "Microphone"],
    isActive: true,
  },
  {
    roomCode: "BLR-03-C",
    name: "Kalam Conference Hall",
    building: "Tower A (Main Campus)",
    floor: 3,
    capacity: 35,
    description: "Large conference space for team all-hands, cross-functional seminars, and external guest presentations.",
    equipment: ["Projector", "Speakers", "Microphone", "Video conferencing", "Whiteboard"],
    isActive: true,
  },
  {
    roomCode: "BLR-04-D",
    name: "Curie Discussion Pod",
    building: "Tower B (Tech Center)",
    floor: 4,
    capacity: 6,
    description: "Medium huddle room optimized for hybrid 1-on-1s and 4-6 person agile standups.",
    equipment: ["Television", "Video conferencing", "Whiteboard"],
    isActive: true,
  },
  {
    roomCode: "BLR-05-E",
    name: "Turing Focus Room",
    building: "Tower B (Tech Center)",
    floor: 5,
    capacity: 4,
    description: "Soundproof compact meeting room with dedicated conference phone and smart TV display.",
    equipment: ["Television", "Conference phone"],
    isActive: true,
  },
  {
    roomCode: "BLR-06-F",
    name: "Babbage Strategy Suite",
    building: "Tower B (Tech Center)",
    floor: 6,
    capacity: 16,
    description: "High-spec strategy meeting suite with 85-inch smart monitor, multi-speaker array, and digital note-taking display.",
    equipment: ["Television", "Speakers", "Microphone", "Video conferencing", "Whiteboard"],
    isActive: true,
  },
  {
    roomCode: "BLR-07-G",
    name: "Franklin Workshop (Archived)",
    building: "Tower B (Tech Center)",
    floor: 2,
    capacity: 10,
    description: "Renovation underway. Deactivated room for testing historical preservation.",
    equipment: ["Whiteboard", "Television"],
    isActive: false, // Inactive room to test deactivation states
  },
];

async function main() {
  console.log("Seeding Enterprise Conference Room Booking System...");

  // 1. Seed Rooms
  for (const room of sampleRooms) {
    await prisma.room.upsert({
      where: { roomCode: room.roomCode },
      update: {
        name: room.name,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
        description: room.description,
        equipment: room.equipment,
        isActive: room.isActive,
      },
      create: room,
    });
  }
  console.log(`Seeded ${sampleRooms.length} conference rooms.`);

  // 2. Explicit Admin Provisioning based on configured environment credentials
  const initialAdminId = process.env.INITIAL_ADMIN_MICROSOFT_ID;
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;

  if (initialAdminEmail) {
    const adminUser = await prisma.user.upsert({
      where: { email: initialAdminEmail },
      update: {
        role: "ADMIN",
        microsoftUserId: initialAdminId || undefined,
        isActive: true,
      },
      create: {
        email: initialAdminEmail,
        name: "Enterprise System Administrator",
        role: "ADMIN",
        microsoftUserId: initialAdminId || null,
        microsoftTenantId: process.env.AZURE_AD_TENANT_ID || null,
        isActive: true,
      },
    });
    console.log(`Explicitly provisioned administrator: ${adminUser.email} (Role: ${adminUser.role})`);
  } else {
    console.log("No INITIAL_ADMIN_EMAIL configured. Skipping automatic admin user creation.");
  }

  // 3. Optional sample employee user for testing (EMPLOYEE role by default)
  const employeeEmail = "employee@enterprise.com";
  const empUser = await prisma.user.upsert({
    where: { email: employeeEmail },
    update: {},
    create: {
      email: employeeEmail,
      name: "Standard Enterprise Employee",
      role: "EMPLOYEE",
      microsoftUserId: "emp-ms-id-67890",
      microsoftTenantId: process.env.AZURE_AD_TENANT_ID || null,
      isActive: true,
    },
  });
  console.log(`Sample employee account: ${empUser.email} (Role: ${empUser.role})`);

  console.log("Database seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
