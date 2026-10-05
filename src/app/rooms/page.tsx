"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { RoomCard } from "@/components/RoomCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useSession } from "next-auth/react";
import { RoomData, UserSession } from "@/types";
import {
  Search,
  Filter,
  PlusCircle,
  DoorOpen,
  RefreshCw,
  Building,
  Layers,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { standardEquipmentOptions } from "@/lib/validations";

export default function RoomsPage() {
  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const isAdmin = user?.role === "ADMIN";
  const { success, error: toastError, info } = useToast();

  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [minCapacity, setMinCapacity] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "occupied">("all");
  const [includeInactive, setIncludeInactive] = useState(false);

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

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (selectedBuilding) params.append("building", selectedBuilding);
      if (selectedFloor) params.append("floor", selectedFloor);
      if (minCapacity) params.append("minCapacity", minCapacity);
      if (isAdmin && includeInactive) params.append("includeInactive", "true");
      selectedEquipment.forEach((eq) => params.append("equipment", eq));

      const res = await fetch(`/api/rooms?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load rooms");
      setRooms(json.data || []);
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [includeInactive]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRooms();
  };

  // Unique buildings and floors for filter dropdowns
  const buildings = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.building && set.add(r.building));
    return Array.from(set);
  }, [rooms]);

  // Client-side availability filter
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (availabilityFilter === "available" && room.isCurrentlyOccupied) return false;
      if (availabilityFilter === "occupied" && !room.isCurrentlyOccupied) return false;
      return true;
    });
  }, [rooms, availabilityFilter]);

  // Handle Deactivation / Reactivation
  const handleDeactivateToggle = (room: RoomData) => {
    const isDeactivating = room.isActive;
    setConfirmDialog({
      isOpen: true,
      title: isDeactivating ? `Deactivate ${room.name}?` : `Reactivate ${room.name}?`,
      message: isDeactivating
        ? `Deactivating '${room.name}' (${room.roomCode}) will prevent new bookings while preserving historical records. If there are future confirmed reservations, they must be cancelled first.`
        : `Reactivating '${room.name}' (${room.roomCode}) will make it immediately available for employees to view and administrators to book.`,
      variant: isDeactivating ? "warning" : "warning",
      confirmLabel: isDeactivating ? "Deactivate Room" : "Reactivate Room",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rooms/${room.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !room.isActive }),
          });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || "Failed to update room status");
          }
          success(`Room '${room.name}' ${isDeactivating ? "deactivated" : "reactivated"} successfully.`);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchRooms();
        } catch (err: any) {
          toastError(err.message);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Handle Safe Deletion
  const handleDelete = (room: RoomData) => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${room.name}?`,
      message: `Are you sure you want to permanently delete '${room.name}' (${room.roomCode})? Note: Rooms with existing booking history cannot be permanently deleted and must be deactivated instead.`,
      variant: "danger",
      confirmLabel: "Delete Room",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/rooms/${room.id}`, {
            method: "DELETE",
          });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || "Failed to delete room");
          }
          success(json.data?.message || "Room deleted successfully.");
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchRooms();
        } catch (err: any) {
          toastError(err.message);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Conference Rooms
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Browse campus conference rooms, seating capacities, and equipment specifications.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchRooms}
              title="Refresh listing"
              className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {isAdmin && (
              <Link
                href="/rooms/new"
                className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/20 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Conference Room</span>
              </Link>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by room name, code, or building..."
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

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
            {/* Building Filter */}
            <select
              value={selectedBuilding}
              aria-label="Filter by Building"
              onChange={(e) => {
                setSelectedBuilding(e.target.value);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="">All Buildings</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            {/* Min Capacity Filter */}
            <select
              value={minCapacity}
              aria-label="Filter by Minimum Capacity"
              onChange={(e) => {
                setMinCapacity(e.target.value);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="">Any Capacity</option>
              <option value="4">4+ People</option>
              <option value="8">8+ People</option>
              <option value="12">12+ People</option>
              <option value="20">20+ People</option>
            </select>

            {/* Availability Filter */}
            <select
              value={availabilityFilter}
              aria-label="Filter by Live Availability"
              onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="all">Live Availability: All</option>
              <option value="available">Available Now Only</option>
              <option value="occupied">Occupied Now Only</option>
            </select>

            {/* Admin toggle: Include Inactive */}
            {isAdmin && (
              <label className="flex items-center space-x-2 cursor-pointer ml-auto text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Include Deactivated Rooms</span>
              </label>
            )}
          </div>
        </div>

        {/* Room Grid */}
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-sm font-medium">Loading conference rooms...</p>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="bg-white p-16 rounded-2xl border border-slate-200 text-center">
            <DoorOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No conference rooms found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No rooms match your filter criteria. Try adjusting your search query or reset filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isAdmin={isAdmin}
                onDeactivateToggle={handleDeactivateToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

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
