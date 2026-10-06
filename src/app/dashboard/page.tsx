"use client";

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  DoorOpen,
  CheckCircle,
  Clock,
  Calendar,
  PlusCircle,
  CalendarPlus,
  ArrowRight,
  Activity,
  Layers,
  Building,
  RefreshCw,
} from "lucide-react";
import { formatCompanyTime, formatCompanyTimeOnly } from "@/lib/timezone";
import { UserSession } from "@/types";

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const isAdmin = user?.role === "ADMIN";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load dashboard metrics");
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome Banner & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                {isAdmin ? "Administrator Workspace" : "Employee Portal"}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
              Welcome back, {user?.name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Live workplace scheduling overview in <strong>Asia/Kolkata (IST)</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchDashboard}
              title="Refresh statistics"
              className="p-2.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {isAdmin ? (
              <>
                <Link
                  href="/rooms/new"
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  <PlusCircle className="w-4 h-4 text-slate-600" />
                  <span>Add Room</span>
                </Link>
                <Link
                  href="/booking-requests"
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
                >
                  <span>Review Requests</span>
                  {data?.stats?.pendingRequestsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-600 text-white">
                      {data.stats.pendingRequestsCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/bookings/new"
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-500/20 transition-all"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Book Conference Room</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/booking-requests/my"
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  <Clock className="w-4 h-4 text-slate-600" />
                  <span>My Requests</span>
                  {data?.stats?.pendingRequestsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-600 text-white">
                      {data.stats.pendingRequestsCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/bookings/request"
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-500/20 transition-all"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Book Conference</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            {error}
          </div>
        )}

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Active Rooms */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Rooms
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <DoorOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-2">
              {loading ? "-" : data?.stats?.totalRooms ?? 0}
            </div>
            <Link
              href="/rooms"
              className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 mt-3 group"
            >
              <span>Explore all rooms</span>
              <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Card 2: Currently Available */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Available Now
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">
              {loading ? "-" : data?.stats?.availableRoomsNow ?? 0}
            </div>
            <Link
              href="/availability"
              className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 mt-3 group"
            >
              <span>Check available slots</span>
              <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Card 3: Currently Occupied */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Occupied Now
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-amber-600 mt-2">
              {loading ? "-" : data?.stats?.occupiedRoomsNow ?? 0}
            </div>
            <span className="text-xs text-slate-400 mt-3 block">
              In progress
            </span>
          </div>

          {/* Card 4: Today's Bookings */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Today's Bookings
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-2">
              {loading ? "-" : data?.stats?.todayBookingsCount ?? 0}
            </div>
            <span className="text-xs text-slate-400 mt-3 block">
              Scheduled
            </span>
          </div>

          {/* Card 5: Pending Requests */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {isAdmin ? "Pending Requests" : "My Pending"}
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-amber-600 mt-2">
              {loading ? "-" : data?.stats?.pendingRequestsCount ?? 0}
            </div>
            <Link
              href={isAdmin ? "/booking-requests" : "/booking-requests/my"}
              className="inline-flex items-center text-xs font-semibold text-amber-700 hover:text-amber-800 mt-3 group"
            >
              <span>{isAdmin ? "Review requests" : "View my requests"}</span>
              <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Two-Column Content: Today's Schedule & Upcoming Reservations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section A: Today's Room Schedule */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Today's Schedule</h2>
              </div>
              <Link
                href="/availability"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Calendar View →
              </Link>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading schedule...</div>
              ) : !data?.todayBookings || data.todayBookings.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  <p className="text-sm font-semibold">No bookings scheduled for today.</p>
                  <p className="text-xs mt-0.5">All conference rooms are currently open.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.todayBookings.map((b: any) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            {b.roomCode}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{b.title}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                          <span>{b.roomName}</span>
                          <span>•</span>
                          <span>Floor {b.floor}</span>
                          {b.organizerName && (
                            <>
                              <span>•</span>
                              <span>Org: {b.organizerName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-xs font-semibold text-slate-800">
                          {formatCompanyTimeOnly(b.startTime)}
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

          {/* Section B: Upcoming Reservations */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Upcoming Reservations</h2>
              </div>
              {isAdmin && (
                <Link
                  href="/bookings"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Manage All →
                </Link>
              )}
            </div>

            <div className="p-5">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading upcoming...</div>
              ) : !data?.upcomingBookings || data.upcomingBookings.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  <p className="text-sm font-semibold">No upcoming reservations found.</p>
                  <p className="text-xs mt-0.5">Check availability to book a conference room.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.upcomingBookings.map((b: any) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            {b.roomCode}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{b.title}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {b.roomName} ({b.building})
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-xs font-semibold text-slate-800">
                          {formatCompanyTime(b.startTime, "MMM d, h:mm a")}
                        </div>
                        <span className="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          Confirmed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Admin Only: Recent Booking & Room Activity Feed */}
        {isAdmin && data?.recentActivity && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-purple-600" />
                <h2 className="text-base font-bold text-slate-900">Recent Administrative Audit Feed</h2>
              </div>
              <Link
                href="/audit-logs"
                className="text-xs font-semibold text-purple-600 hover:text-purple-700"
              >
                View Full Audit Logs →
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {data.recentActivity.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No administrative actions logged yet.
                </div>
              ) : (
                data.recentActivity.map((act: any) => (
                  <div key={act.id} className="p-4 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {act.action}
                      </span>
                      <span className="text-slate-600">
                        {act.actor?.name || act.actorEmail || "Administrator"} on {act.targetType}
                      </span>
                    </div>
                    <span className="text-slate-400">
                      {formatCompanyTime(act.createdAt, "MMM d, h:mm a")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
