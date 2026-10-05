"use client";

import React, { useEffect, useState, Suspense } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CalendarView } from "@/components/CalendarView";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { UserSession, RoomAvailabilitySlot } from "@/types";
import { format } from "date-fns";
import { Filter, RefreshCw } from "lucide-react";

function AvailabilityContent() {
  const searchParams = useSearchParams();
  const initialRoomId = searchParams.get("roomId") || "";
  const initialDate = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");

  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const userRole = user?.role || "EMPLOYEE";
  const { error: toastError } = useToast();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [rooms, setRooms] = useState<RoomAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("date", selectedDate);
      params.append("view", viewMode);
      if (selectedRoomId) params.append("roomId", selectedRoomId);
      if (selectedBuilding) params.append("building", selectedBuilding);
      if (selectedFloor) params.append("floor", selectedFloor);

      const res = await fetch(`/api/availability?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load availability");
      setRooms(json.data?.rooms || []);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [selectedDate, viewMode, selectedRoomId, selectedBuilding, selectedFloor]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Room Availability Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect scheduled meetings, find vacant time windows, and plan reservations in company time (IST).
          </p>
        </div>

        <button
          onClick={fetchAvailability}
          title="Refresh availability"
          className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-500 font-semibold mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {/* Building Filter */}
        <select
          value={selectedBuilding}
          aria-label="Filter by Building"
          onChange={(e) => setSelectedBuilding(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
        >
          <option value="">All Buildings</option>
          <option value="Tower A (Main Campus)">Tower A (Main Campus)</option>
          <option value="Tower B (Tech Center)">Tower B (Tech Center)</option>
        </select>

        {/* Floor Filter */}
        <select
          value={selectedFloor}
          aria-label="Filter by Floor"
          onChange={(e) => setSelectedFloor(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
        >
          <option value="">All Floors</option>
          <option value="1">Floor 1</option>
          <option value="2">Floor 2</option>
          <option value="3">Floor 3</option>
          <option value="4">Floor 4</option>
          <option value="5">Floor 5</option>
          <option value="6">Floor 6</option>
        </select>

        {/* Room Filter */}
        <select
          value={selectedRoomId}
          aria-label="Filter by Specific Room"
          onChange={(e) => setSelectedRoomId(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
        >
          <option value="">All Rooms</option>
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.roomCode} - {r.roomName}
            </option>
          ))}
        </select>

        {(selectedBuilding || selectedFloor || selectedRoomId) && (
          <button
            onClick={() => {
              setSelectedBuilding("");
              setSelectedFloor("");
              setSelectedRoomId("");
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Interactive Calendar Component */}
      <CalendarView
        rooms={rooms}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        userRole={userRole}
        isLoading={loading}
      />
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading calendar...</div>}>
        <AvailabilityContent />
      </Suspense>
    </AppLayout>
  );
}
