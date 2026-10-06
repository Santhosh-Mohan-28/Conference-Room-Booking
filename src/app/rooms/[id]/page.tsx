"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserSession } from "@/types";
import {
  ArrowLeft,
  Building,
  Layers,
  Users,
  CalendarPlus,
  Edit2,
  Power,
  Trash2,
  Clock,
  Calendar,
  CheckCircle2,
  Tv,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { formatCompanyTime, formatCompanyTimeOnly } from "@/lib/timezone";

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const isAdmin = user?.role === "ADMIN";
  const { success, error: toastError } = useToast();

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "danger" | "warning";
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    variant: "warning",
    confirmLabel: "Confirm",
    onConfirm: () => {},
  });

  const fetchRoom = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load room");
      setRoom(json.data);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchRoom();
  }, [id]);

  const handleDeactivateToggle = () => {
    if (!room) return;
    const isDeactivating = room.isActive;
    setConfirmDialog({
      isOpen: true,
      title: isDeactivating ? `Deactivate ${room.name}?` : `Reactivate ${room.name}?`,
      message: isDeactivating
        ? `Deactivating '${room.name}' (${room.roomCode}) will prevent new bookings while preserving historical records. If there are future confirmed reservations, they must be cancelled first.`
        : `Reactivating '${room.name}' will make it immediately available for reservations.`,
      variant: "warning",
      confirmLabel: isDeactivating ? "Deactivate Room" : "Reactivate Room",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rooms/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !room.isActive }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to update room status");
          success(`Room status updated.`);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchRoom();
        } catch (err: any) {
          toastError(err.message);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleDelete = () => {
    if (!room) return;
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${room.name}?`,
      message: `Are you sure you want to permanently delete '${room.name}' (${room.roomCode})? Note: Rooms with existing booking history cannot be permanently deleted and must be deactivated instead.`,
      variant: "danger",
      confirmLabel: "Delete Room",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rooms/${id}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to delete room");
          success("Room deleted successfully.");
          router.push("/rooms");
        } catch (err: any) {
          toastError(err.message);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-16 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-sm">Loading room specifications...</p>
        </div>
      </AppLayout>
    );
  }

  if (!room) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-2xl border border-slate-200 text-center">
          <h2 className="text-lg font-bold text-slate-800">Room Not Found</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            The requested conference room may have been removed or deactivated.
          </p>
          <Link
            href="/rooms"
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl"
          >
            Back to All Rooms
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/rooms"
              className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {room.roomCode}
                </span>
                {!room.isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    DEACTIVATED
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
                {room.name}
              </h1>
            </div>
          </div>

          {/* Action Buttons */}
          {isAdmin ? (
            <div className="flex items-center space-x-2.5">
              {room.isActive && (
                <Link
                  href={`/bookings/new?roomId=${room.id}`}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Book Room</span>
                </Link>
              )}
              <Link
                href={`/rooms/${room.id}/edit`}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Link>
              <button
                onClick={handleDeactivateToggle}
                className={`p-2 rounded-xl border transition-colors ${
                  room.isActive
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                }`}
                title={room.isActive ? "Deactivate" : "Reactivate"}
              >
                <Power className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl transition-colors"
                title="Delete Room"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            room.isActive && (
              <div className="flex items-center space-x-2.5">
                <Link
                  href={`/bookings/request?roomId=${room.id}`}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Request Booking</span>
                </Link>
              </div>
            )
          )}
        </div>

        {/* Room Specifications Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Room Overview & Facilities
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {room.description || "No detailed description provided for this room."}
              </p>
            </div>

            {/* Equipment Grid */}
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                Installed Hardware & Equipment
              </h2>
              {room.equipment && room.equipment.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {room.equipment.map((item: string, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200/70 text-xs font-semibold text-slate-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>{item}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Standard table and chairs only.</p>
              )}
            </div>

            {/* Upcoming Reservations for this room */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Scheduled Reservations</span>
                </h2>
                <Link
                  href={`/availability?roomId=${room.id}`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Availability Calendar →
                </Link>
              </div>

              {!room.bookings || room.bookings.length === 0 ? (
                <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-100 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-emerald-900">
                    No reservations currently scheduled for this room.
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    The entire room schedule is open for booking.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {room.bookings.map((b: any) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-bold text-slate-900">{b.title}</div>
                        {b.organizerName && (
                          <div className="text-xs text-slate-500">
                            Organizer: {b.organizerName}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-800">
                          {formatCompanyTime(b.startTime, "MMM d, h:mm a")}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          to {formatCompanyTimeOnly(b.endTime)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Location & Status Sidebar */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Location Details
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500 flex items-center space-x-1.5">
                    <Building className="w-4 h-4 text-slate-400" />
                    <span>Building:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{room.building}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500 flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span>Floor Level:</span>
                  </span>
                  <span className="font-semibold text-slate-800">Floor {room.floor}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-slate-500 flex items-center space-x-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Capacity:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{room.capacity} seats</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Total Reservations:</span>
                  <span className="font-semibold text-slate-800">
                    {room.totalBookingsCount ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {isAdmin && room.isActive && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                <h4 className="text-sm font-bold">Schedule an Event</h4>
                <p className="text-xs text-blue-100 mt-1 mb-3">
                  Check availability conflicts and book this room for your meeting.
                </p>
                <Link
                  href={`/bookings/new?roomId=${room.id}`}
                  className="block text-center py-2 px-3 rounded-xl bg-white text-blue-600 text-xs font-bold shadow-xs hover:bg-blue-50 transition-colors"
                >
                  Create Booking Now
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Modal Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </AppLayout>
  );
}
