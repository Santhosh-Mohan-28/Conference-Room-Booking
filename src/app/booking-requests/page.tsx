"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { BookingRequestData } from "@/types";
import { formatCompanyTime, formatCompanyDate, formatCompanyTimeOnly } from "@/lib/timezone";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Building,
  User,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Check,
  X,
} from "lucide-react";

export default function AdminBookingRequestsPage() {
  const { success, error: toastError } = useToast();

  const [requests, setRequests] = useState<BookingRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");
  const [search, setSearch] = useState("");

  // Reject modal state
  const [rejectDialog, setRejectDialog] = useState<{
    isOpen: boolean;
    requestId: string | null;
    requestTitle: string;
    reason: string;
  }>({
    isOpen: false,
    requestId: null,
    requestTitle: "",
    reason: "",
  });

  // Action loading state for specific items
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (search) params.append("search", search);

      const res = await fetch(`/api/booking-requests?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load booking requests");
      setRequests(json.data?.requests || []);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filterStatus]);

  const handleApprove = async (req: BookingRequestData) => {
    setActionLoadingId(req.id);
    try {
      const res = await fetch(`/api/booking-requests/${req.id}/approve`, {
        method: "PATCH",
      });
      const json = await res.json();

      if (res.status === 409) {
        toastError(json.error || "Room conflict: The room is no longer available for this time slot.");
        return;
      }

      if (!res.ok) {
        throw new Error(json.error || "Failed to approve booking request");
      }

      success(`Booking request for '${req.title}' approved and confirmed.`);
      fetchRequests();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenReject = (req: BookingRequestData) => {
    setRejectDialog({
      isOpen: true,
      requestId: req.id,
      requestTitle: req.title,
      reason: "",
    });
  };

  const handleConfirmReject = async () => {
    if (!rejectDialog.requestId) return;
    const reqId = rejectDialog.requestId;
    setActionLoadingId(reqId);

    try {
      const res = await fetch(`/api/booking-requests/${reqId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectDialog.reason || undefined }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to reject booking request");
      }

      success(`Booking request for '${rejectDialog.requestTitle}' rejected.`);
      setRejectDialog((prev) => ({ ...prev, isOpen: false }));
      fetchRequests();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AppLayout requireAdminRole={true}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Booking Requests
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Review and authorize employee conference room reservation requests.
            </p>
          </div>

          <button
            onClick={fetchRequests}
            title="Refresh requests"
            className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto">
            {[
              { id: "PENDING", label: "Pending Review" },
              { id: "all", label: "All Requests" },
              { id: "APPROVED", label: "Approved" },
              { id: "REJECTED", label: "Rejected" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                  filterStatus === tab.id
                    ? "bg-blue-600 text-white shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchRequests();
            }}
            className="flex items-center space-x-2 w-full md:w-auto"
          >
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by title, requester, room..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Request List */}
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-sm font-medium">Loading booking requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No booking requests found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are currently no booking requests matching the selected filter criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {req.room?.roomCode}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{req.title}</h3>
                    {req.status === "PENDING" && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Pending Review
                      </span>
                    )}
                    {req.status === "APPROVED" && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Approved
                      </span>
                    )}
                    {req.status === "REJECTED" && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        Rejected
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center space-x-1">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-semibold text-slate-800">{req.requester?.name}</span>
                      <span className="text-slate-400">({req.requester?.email})</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.room?.name} (Floor {req.room?.floor})</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatCompanyDate(req.startTime, "MMMM d, yyyy")}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {formatCompanyTimeOnly(req.startTime)} – {formatCompanyTimeOnly(req.endTime)} (IST)
                      </span>
                    </span>
                  </div>

                  {req.description && (
                    <p className="text-xs text-slate-600 pt-1 italic">
                      "{req.description}"
                    </p>
                  )}

                  {req.status === "REJECTED" && req.rejectionReason && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-800 mt-2">
                      <span className="font-semibold">Rejection Reason: </span>
                      <span>{req.rejectionReason}</span>
                    </div>
                  )}

                  {req.status === "APPROVED" && req.reviewedBy && (
                    <div className="text-[11px] text-slate-400 pt-1">
                      Approved by {req.reviewedBy.name} on {req.reviewedAt ? formatCompanyTime(req.reviewedAt, "MMM d, h:mm a") : "-"}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 flex-shrink-0 self-end lg:self-center">
                  {req.status === "PENDING" ? (
                    <>
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={actionLoadingId === req.id}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{actionLoadingId === req.id ? "Checking..." : "Approve"}</span>
                      </button>

                      <button
                        onClick={() => handleOpenReject(req)}
                        disabled={actionLoadingId === req.id}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium italic">
                      Processed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reject Dialog */}
        {rejectDialog.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Reject Booking Request
              </h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to reject the booking request for <strong>{rejectDialog.requestTitle}</strong>?
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason (Optional):
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Room reserved for executive executive summit..."
                  value={rejectDialog.reason}
                  onChange={(e) =>
                    setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setRejectDialog((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
