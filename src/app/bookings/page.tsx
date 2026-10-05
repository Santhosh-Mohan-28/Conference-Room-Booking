"use client";

import React, { useEffect, useState, Suspense } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { BookingData, RoomData } from "@/types";
import {
  Calendar,
  Clock,
  Search,
  Filter,
  RefreshCw,
  CalendarPlus,
  Edit2,
  XCircle,
  Building,
  CheckCircle2,
  User,
} from "lucide-react";
import Link from "next/link";
import { formatCompanyTime, formatCompanyTimeOnly, formatCompanyDate } from "@/lib/timezone";

function ManageBookingsContent() {
  const { success, error: toastError } = useToast();

  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "CANCELLED">("ALL");
  const [timeframe, setTimeframe] = useState<"all" | "upcoming" | "past">("all");

  // Cancellation Dialog State
  const [cancelDialog, setCancelDialog] = useState<{
    isOpen: boolean;
    booking: BookingData | null;
  }>({
    isOpen: false,
    booking: null,
  });
  const [isCancelling, setIsCancelling] = useState(false);

  // Edit Modal State
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    booking: BookingData | null;
    title: string;
    organizerName: string;
    description: string;
  }>({
    isOpen: false,
    booking: null,
    title: "",
    organizerName: "",
    description: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms?includeInactive=true");
      const json = await res.json();
      if (res.ok) setRooms(json.data || []);
    } catch (e) {}
  };

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (selectedRoomId) params.append("roomId", selectedRoomId);
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (timeframe !== "all") params.append("timeframe", timeframe);
      params.append("limit", "50");

      const res = await fetch(`/api/bookings?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load bookings");
      setBookings(json.data?.bookings || []);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [selectedRoomId, statusFilter, timeframe]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBookings();
  };

  const handleCancelConfirm = async () => {
    if (!cancelDialog.booking) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${cancelDialog.booking.id}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to cancel booking");

      success(json.data?.message || "Booking successfully cancelled.");
      setCancelDialog({ isOpen: false, booking: null });
      fetchBookings();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenEdit = (b: BookingData) => {
    setEditModal({
      isOpen: true,
      booking: b,
      title: b.title,
      organizerName: b.organizerName,
      description: b.description || "",
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.booking) return;
    setIsUpdating(true);

    try {
      const res = await fetch(`/api/bookings/${editModal.booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editModal.title,
          organizerName: editModal.organizerName,
          description: editModal.description,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update booking");

      success("Booking updated successfully.");
      setEditModal((prev) => ({ ...prev, isOpen: false }));
      fetchBookings();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manage Bookings
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            View all enterprise reservations, update meeting metadata, or process cancellations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchBookings}
            title="Refresh bookings"
            className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/bookings/new"
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/20 transition-all"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>New Booking</span>
          </Link>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by title, organizer, or room code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Room Filter */}
          <select
            value={selectedRoomId}
            aria-label="Filter by Room"
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="">All Conference Rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomCode} - {r.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            aria-label="Filter by Status"
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">Confirmed Only</option>
            <option value="CANCELLED">Cancelled Only</option>
          </select>

          {/* Timeframe Filter */}
          <select
            value={timeframe}
            aria-label="Filter by Timeframe"
            onChange={(e) => setTimeframe(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="all">All Dates</option>
            <option value="upcoming">Upcoming Only</option>
            <option value="past">Past Bookings Only</option>
          </select>

          {(search || selectedRoomId || statusFilter !== "ALL" || timeframe !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedRoomId("");
                setStatusFilter("ALL");
                setTimeframe("all");
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Bookings Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-sm font-medium">Loading reservations...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No reservations found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No bookings match your current filter settings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Meeting Title</th>
                  <th className="py-3.5 px-4">Conference Room</th>
                  <th className="py-3.5 px-4">Date & Time (IST)</th>
                  <th className="py-3.5 px-4">Organizer</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created By</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => {
                  const isCancelled = b.status === "CANCELLED";
                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isCancelled ? "bg-slate-50/40 opacity-70" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm text-slate-900">{b.title}</div>
                        {b.description && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {b.description}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {b.room?.roomCode}
                          </span>
                          <span className="font-medium text-slate-800">{b.room?.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {b.room?.building}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">
                          {formatCompanyTime(b.startTime, "MMM d, yyyy")}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {formatCompanyTimeOnly(b.startTime)} -{" "}
                            {formatCompanyTimeOnly(b.endTime)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{b.organizerName}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isCancelled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Cancelled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Confirmed
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {b.createdBy?.name || b.createdBy?.email || "Admin"}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {!isCancelled && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(b)}
                                title="Edit booking details"
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setCancelDialog({ isOpen: true, booking: b })}
                                title="Cancel booking"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Cancellation */}
      <ConfirmDialog
        isOpen={cancelDialog.isOpen}
        title="Cancel Conference Room Reservation?"
        message={`Are you sure you want to cancel the reservation '${cancelDialog.booking?.title}' in ${cancelDialog.booking?.room?.name}? Reservation history will be preserved, and the time slot will be reopened for other bookings.`}
        confirmLabel="Cancel Booking"
        variant="danger"
        isLoading={isCancelling}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelDialog({ isOpen: false, booking: null })}
      />

      {/* Edit Booking Modal */}
      {editModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Edit Meeting Details
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Update meeting title, organizer, or agenda description.
            </p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  required
                  value={editModal.title}
                  onChange={(e) => setEditModal({ ...editModal, title: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Organizer
                </label>
                <input
                  type="text"
                  required
                  value={editModal.organizerName}
                  onChange={(e) =>
                    setEditModal({ ...editModal, organizerName: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editModal.description}
                  onChange={(e) =>
                    setEditModal({ ...editModal, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isUpdating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingsManagementPage() {
  return (
    <AppLayout requireAdminRole={true}>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading booking records...</div>}>
        <ManageBookingsContent />
      </Suspense>
    </AppLayout>
  );
}
