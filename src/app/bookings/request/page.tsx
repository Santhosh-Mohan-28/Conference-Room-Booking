"use client";

import React, { useEffect, useState, Suspense } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { RoomData } from "@/types";
import { parseCompanyDateTimeToUTC } from "@/lib/timezone";
import {
  Send,
  ArrowLeft,
  Building,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  Layers,
  Info,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

function BookingRequestFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedRoomId = searchParams.get("roomId") || "";
  const preselectedDate = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");

  const { success, error: toastError } = useToast();

  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    roomId: preselectedRoomId,
    title: "",
    description: "",
    date: preselectedDate,
    startTime: "10:00",
    endTime: "11:00",
  });

  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Fetch active rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch("/api/rooms");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const activeOnly = (json.data || []).filter((r: RoomData) => r.isActive);
        setRooms(activeOnly);
        if (!formData.roomId && activeOnly.length > 0) {
          setFormData((prev) => ({ ...prev, roomId: activeOnly[0].id }));
        }
      } catch (err: any) {
        toastError(err.message);
      } finally {
        setLoadingRooms(false);
      }
    };
    fetchRooms();
  }, []);

  const selectedRoom = rooms.find((r) => r.id === formData.roomId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setConflictWarning(null);

    try {
      if (!formData.roomId) {
        throw new Error("Please select an active conference room.");
      }

      const startUTC = parseCompanyDateTimeToUTC(formData.date, formData.startTime);
      const endUTC = parseCompanyDateTimeToUTC(formData.date, formData.endTime);

      if (endUTC.getTime() <= startUTC.getTime()) {
        throw new Error("End time must be later than start time.");
      }

      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: formData.roomId,
          title: formData.title,
          description: formData.description,
          startTime: startUTC.toISOString(),
          endTime: endUTC.toISOString(),
        }),
      });

      const json = await res.json();

      if (res.status === 409) {
        setConflictWarning(json.error || "This room is not available for the selected time.");
        toastError("Scheduling conflict: This room is not available for the selected time.");
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        throw new Error(json.error || "Failed to submit booking request.");
      }

      success("Booking request submitted successfully! An administrator will review your request.");
      router.push("/booking-requests/my");
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Link
          href="/rooms"
          className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Request Conference Room
          </h1>
          <p className="text-xs text-slate-500">
            Submit a reservation request for administrative review.
          </p>
        </div>
      </div>

      {/* Workflow Explanatory Notice */}
      <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/90 flex items-start space-x-3 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Administrative Approval Required</span>
          <p className="mt-0.5 text-blue-800">
            Employees can submit room booking requests. An administrator will review your request and confirm your reservation if the slot remains vacant.
          </p>
        </div>
      </div>

      {conflictWarning && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-3 text-sm text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Room Unavailable</span>
            <p className="text-xs mt-0.5">{conflictWarning}</p>
            <p className="text-xs mt-1 text-amber-700">
              Please choose a different time window or select another active conference room.
            </p>
          </div>
        </div>
      )}

      {/* Booking Request Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/90 shadow-xs space-y-6"
      >
        {/* Room Picker */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Select Conference Room <span className="text-rose-500">*</span>
          </label>
          {loadingRooms ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400">
              Loading available conference rooms...
            </div>
          ) : rooms.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
              No active conference rooms are currently registered. Please contact an administrator.
            </div>
          ) : (
            <select
              required
              aria-label="Select Conference Room"
              value={formData.roomId}
              onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomCode} - {r.name} ({r.building}, Fl. {r.floor}, {r.capacity} seats)
                </option>
              ))}
            </select>
          )}

          {selectedRoom && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{selectedRoom.name}</span>
              <span>•</span>
              <span>{selectedRoom.building}</span>
              <span>•</span>
              <span>Floor {selectedRoom.floor}</span>
              <span>•</span>
              <span>Max {selectedRoom.capacity} attendees</span>
            </div>
          )}
        </div>

        {/* Meeting Details */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Meeting Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Sprint Retrospective & Planning"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Date & Time Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Reservation Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Start Time (IST) <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              required
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              End Time (IST) <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              required
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Agenda / Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Meeting Description & Purpose
          </label>
          <textarea
            rows={3}
            placeholder="Brief description of the meeting, required AV equipment, or external participants..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Submit Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
          <Link
            href="/rooms"
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || rooms.length === 0}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? "Submitting Request..." : "Send Booking Request"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BookingRequestPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading request form...</div>}>
        <BookingRequestFormContent />
      </Suspense>
    </AppLayout>
  );
}
