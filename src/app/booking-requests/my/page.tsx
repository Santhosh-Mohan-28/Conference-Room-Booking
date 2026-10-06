"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/components/Toast";
import { BookingRequestData } from "@/types";
import { formatCompanyTime, formatCompanyDate, formatCompanyTimeOnly } from "@/lib/timezone";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Building,
  RefreshCw,
  PlusCircle,
  Send,
  DoorOpen,
} from "lucide-react";
import Link from "next/link";

export default function MyBookingRequestsPage() {
  const { error: toastError } = useToast();
  const [requests, setRequests] = useState<BookingRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);

      const res = await fetch(`/api/booking-requests/my?${params.toString()}`);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Review</span>
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved</span>
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              My Booking Requests
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Track the approval status of your conference room reservation requests.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchRequests}
              title="Refresh requests"
              className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <Link
              href="/bookings/request"
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Request Conference Room</span>
            </Link>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
          {[
            { id: "all", label: "All Requests" },
            { id: "PENDING", label: "Pending" },
            { id: "APPROVED", label: "Approved" },
            { id: "REJECTED", label: "Rejected" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                filterStatus === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Request List */}
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-sm font-medium">Loading your booking requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No booking requests found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              You have not submitted any room booking requests matching this status filter.
            </p>
            <div className="mt-4">
              <Link
                href="/bookings/request"
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Submit a Request</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {req.room?.roomCode}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{req.title}</h3>
                    {getStatusBadge(req.status)}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.room?.name} ({req.room?.building}, Floor {req.room?.floor})</span>
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
                      <span className="font-semibold">Reason for Rejection: </span>
                      <span>{req.rejectionReason}</span>
                    </div>
                  )}

                  {req.status === "APPROVED" && (
                    <div className="text-[11px] text-emerald-700 font-medium pt-1">
                      Confirmed reservation active in company calendar.
                    </div>
                  )}
                </div>

                <div className="text-right text-[11px] text-slate-400 flex-shrink-0">
                  <div>Requested on:</div>
                  <div className="font-medium text-slate-600">
                    {formatCompanyTime(req.createdAt, "MMM d, yyyy h:mm a")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
