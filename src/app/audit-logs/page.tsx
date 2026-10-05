"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/components/Toast";
import {
  FileText,
  RefreshCw,
  Shield,
  Clock,
  Layers,
  Calendar,
} from "lucide-react";
import { formatCompanyTime } from "@/lib/timezone";

export default function AuditLogsPage() {
  const { error: toastError } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append("action", actionFilter);
      if (targetTypeFilter) params.append("targetType", targetTypeFilter);
      params.append("limit", "50");

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load audit logs");
      setLogs(json.data?.logs || []);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, targetTypeFilter]);

  return (
    <AppLayout requireAdminRole={true}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Administrative Audit Logs
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Immutable historical trace of room modifications and booking management events.
            </p>
          </div>

          <button
            onClick={fetchLogs}
            title="Refresh audit logs"
            className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-3 text-xs">
          <select
            value={actionFilter}
            aria-label="Filter by Event Action"
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="">All Actions</option>
            <option value="ROOM_CREATED">Room Created</option>
            <option value="ROOM_UPDATED">Room Updated</option>
            <option value="ROOM_DEACTIVATED">Room Deactivated</option>
            <option value="ROOM_REACTIVATED">Room Reactivated</option>
            <option value="ROOM_DELETED">Room Deleted</option>
            <option value="BOOKING_CREATED">Booking Created</option>
            <option value="BOOKING_UPDATED">Booking Updated</option>
            <option value="BOOKING_CANCELLED">Booking Cancelled</option>
          </select>

          <select
            value={targetTypeFilter}
            aria-label="Filter by Target Type"
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
          >
            <option value="">All Entities</option>
            <option value="ROOM">Room</option>
            <option value="BOOKING">Booking</option>
          </select>

          {(actionFilter || targetTypeFilter) && (
            <button
              onClick={() => {
                setActionFilter("");
                setTargetTypeFilter("");
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
              <p className="text-sm font-medium">Loading audit events...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-16 text-center text-slate-500">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">No audit records found</h3>
              <p className="text-xs text-slate-500 mt-1">
                Administrative events will automatically be recorded here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Timestamp (IST)</th>
                    <th className="py-3.5 px-4">Administrator</th>
                    <th className="py-3.5 px-4">Action</th>
                    <th className="py-3.5 px-4">Entity</th>
                    <th className="py-3.5 px-4">Event Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        {formatCompanyTime(log.createdAt, "MMM d, yyyy h:mm:ss a")}
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        {log.actor?.name || log.actorEmail || "System Administrator"}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.targetType === "ROOM"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {log.targetType}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px] max-w-md truncate">
                        {log.details ? JSON.stringify(log.details) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
