import { prisma } from "./prisma";

export type AuditAction =
  | "ROOM_CREATED"
  | "ROOM_UPDATED"
  | "ROOM_DEACTIVATED"
  | "ROOM_REACTIVATED"
  | "ROOM_DELETED"
  | "BOOKING_CREATED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REQUEST_CREATED"
  | "BOOKING_REQUEST_APPROVED"
  | "BOOKING_REQUEST_REJECTED"
  | "USER_ACCESS_GRANTED"
  | "USER_ROLE_UPDATED"
  | "USER_STATUS_UPDATED";

export interface LogAuditParams {
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType: "ROOM" | "BOOKING" | "BOOKING_REQUEST" | "USER";
  targetId: string;
  details?: Record<string, any>;
}

export async function logAuditEvent({
  actorId,
  actorEmail,
  action,
  targetType,
  targetId,
  details,
}: LogAuditParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        actorEmail: actorEmail || null,
        action,
        targetType,
        targetId,
        details: details ? (details as any) : undefined,
      },
    });
  } catch (error) {
    // Audit logging should not crash the primary action if an error occurs, but log error to console
    console.error("Failed to write audit log:", error);
    return null;
  }
}
