"use client";

import React, { useState } from "react";
import Link from "next/link";
import { RoomAvailabilitySlot, Role } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Building,
  Users,
  CheckCircle,
  XCircle,
  PlusCircle,
} from "lucide-react";
import { formatCompanyTime, formatCompanyTimeOnly } from "@/lib/timezone";
import { format, parseISO, addDays, subDays } from "date-fns";

interface CalendarViewProps {
  rooms: RoomAvailabilitySlot[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  viewMode: "daily" | "weekly" | "monthly";
  onViewModeChange: (mode: "daily" | "weekly" | "monthly") => void;
  userRole: Role;
  isLoading?: boolean;
}

// 24-hour hour markers for daily timeline (8:00 AM to 8:00 PM corporate window)
const hoursOfDay = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export function CalendarView({
  rooms,
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  userRole,
  isLoading = false,
}: CalendarViewProps) {
  const isAdmin = userRole === "ADMIN";

  const handlePrevDay = () => {
    const current = parseISO(selectedDate);
    const prev = subDays(current, viewMode === "weekly" ? 7 : 1);
    onDateChange(format(prev, "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    const current = parseISO(selectedDate);
    const next = addDays(current, viewMode === "weekly" ? 7 : 1);
    onDateChange(format(next, "yyyy-MM-dd"));
  };

  const handleToday = () => {
    onDateChange(format(new Date(), "yyyy-MM-dd"));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Top Header: Navigation & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
            <button
              onClick={handlePrevDay}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNextDay}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <CalendarIcon className="w-4 h-4 text-blue-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-xl self-start sm:self-auto">
          {(["daily", "weekly", "monthly"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                viewMode === mode
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {mode} View
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 bg-white border-b border-slate-100 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Status Legend:</span>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-300" />
          <span>Available Slot</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-rose-100 border border-rose-300" />
          <span>Confirmed Reservation</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-300 text-slate-400" />
          <span>Past / Outside Hours</span>
        </div>
        <div className="ml-auto text-[11px] text-slate-400">
          Times formatted in <strong>Asia/Kolkata (IST)</strong>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading room availability calendar...</p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <p className="text-base font-semibold text-slate-800">No rooms match your filter criteria.</p>
          <p className="text-xs mt-1">Try clearing building or floor filters to view all active rooms.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rooms.map((room) => (
            <div key={room.roomId} className="p-5 hover:bg-slate-50/50 transition-colors">
              {/* Room Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center space-x-3">
                  <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    {room.roomCode}
                  </span>
                  <Link
                    href={`/rooms/${room.roomId}`}
                    className="font-bold text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    {room.roomName}
                  </Link>
                  <span className="text-xs text-slate-500 flex items-center space-x-1">
                    <Building className="w-3 h-3" />
                    <span>{room.building} (Fl. {room.floor})</span>
                  </span>
                  <span className="text-xs text-slate-500 flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{room.capacity} seats</span>
                  </span>
                </div>

                {isAdmin && (
                  <Link
                    href={`/bookings/new?roomId=${room.roomId}&date=${selectedDate}`}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors self-start sm:self-auto"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Book this room</span>
                  </Link>
                )}
              </div>

              {/* Bookings / Schedule for this room */}
              {room.bookings.length === 0 ? (
                <div className="py-3 px-4 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Entire schedule is currently available for reservations.</span>
                  </div>
                  {isAdmin && (
                    <Link
                      href={`/bookings/new?roomId=${room.roomId}&date=${selectedDate}`}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      Schedule Meeting →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Scheduled Reservations ({room.bookings.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {room.bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="p-3 rounded-xl border border-rose-200/90 bg-rose-50/50 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {booking.title}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-800">
                              Reserved
                            </span>
                          </div>
                          {booking.organizerName && (
                            <p className="text-[11px] text-slate-500 mb-1">
                              Organizer: {booking.organizerName}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-rose-900 font-medium pt-2 border-t border-rose-100 mt-2">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-rose-600" />
                            <span>
                              {formatCompanyTimeOnly(booking.startTime)} -{" "}
                              {formatCompanyTimeOnly(booking.endTime)}
                            </span>
                          </div>
                          {isAdmin && (
                            <Link
                              href={`/bookings`}
                              className="text-[11px] text-rose-700 hover:underline font-semibold"
                            >
                              Manage
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
