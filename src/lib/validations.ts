import { z } from "zod";

export const standardEquipmentOptions = [
  "Projector",
  "Television",
  "Video conferencing",
  "Whiteboard",
  "Microphone",
  "Speakers",
  "Conference phone",
] as const;

export const roomCreateSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(2, "Room code must be at least 2 characters")
    .max(20, "Room code must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Room code must contain only letters, numbers, hyphens, and underscores"),
  name: z.string().trim().min(2, "Room name must be at least 2 characters").max(100),
  building: z.string().trim().min(1, "Building is required").max(100),
  floor: z.coerce.number().int("Floor must be an integer").min(-10, "Floor too low").max(200, "Floor too high"),
  capacity: z.coerce.number().int("Capacity must be an integer").min(1, "Capacity must be at least 1 person").max(1000),
  description: z.string().trim().max(1000).optional().nullable(),
  equipment: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().default(true),
});

export const roomUpdateSchema = roomCreateSchema.partial();

export const bookingCreateSchema = z
  .object({
    roomId: z.string().min(1, "Room is required"),
    title: z.string().trim().min(2, "Meeting title must be at least 2 characters").max(150),
    description: z.string().trim().max(1000).optional().nullable(),
    organizerName: z.string().trim().min(2, "Organizer name must be at least 2 characters").max(100),
    startTime: z.string().datetime({ message: "Start time must be a valid ISO datetime" }),
    endTime: z.string().datetime({ message: "End time must be a valid ISO datetime" }),
  })
  .refine(
    (data) => {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);
      return end.getTime() > start.getTime();
    },
    {
      message: "End time must be later than start time",
      path: ["endTime"],
    }
  );

export const bookingUpdateSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    title: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    organizerName: z.string().trim().min(2).max(100).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return new Date(data.endTime).getTime() > new Date(data.startTime).getTime();
      }
      return true;
    },
    {
      message: "End time must be later than start time",
      path: ["endTime"],
    }
  );

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  roomId: z.string().optional(),
  building: z.string().optional(),
  floor: z.coerce.number().int().optional(),
  minCapacity: z.coerce.number().int().optional(),
  view: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});
