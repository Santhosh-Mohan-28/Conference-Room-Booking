export type Role = "ADMIN" | "EMPLOYEE";
export type BookingStatus = "CONFIRMED" | "CANCELLED";

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: Role;
  microsoftUserId?: string | null;
  microsoftTenantId?: string | null;
}

export interface RoomData {
  id: string;
  roomCode: string;
  name: string;
  building: string;
  floor: number;
  capacity: number;
  description: string | null;
  equipment: string[];
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  bookingsCount?: number;
  isCurrentlyOccupied?: boolean;
}

export interface BookingData {
  id: string;
  roomId: string;
  room?: RoomData;
  createdById: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  organizerName: string;
  title: string;
  description: string | null;
  startTime: string | Date;
  endTime: string | Date;
  status: BookingStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  cancelledAt: string | Date | null;
}

export interface RoomAvailabilitySlot {
  roomId: string;
  roomCode: string;
  roomName: string;
  building: string;
  floor: number;
  capacity: number;
  equipment: string[];
  bookings: {
    id: string;
    title: string;
    organizerName?: string;
    startTime: string;
    endTime: string;
    status: BookingStatus;
  }[];
}

export interface DashboardStats {
  totalRooms: number;
  availableRoomsNow: number;
  occupiedRoomsNow: number;
  todayBookingsCount: number;
  upcomingBookingsCount: number;
  todayBookings: BookingData[];
  upcomingBookings: BookingData[];
  recentActivity?: {
    id: string;
    action: string;
    actorEmail: string | null;
    targetType: string;
    details: any;
    createdAt: string | Date;
  }[];
}
