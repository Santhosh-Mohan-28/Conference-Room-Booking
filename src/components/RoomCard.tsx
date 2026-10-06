"use client";

import React from "react";
import Link from "next/link";
import { RoomData } from "@/types";
import {
  Users,
  Building,
  Layers,
  Tv,
  CheckCircle2,
  Clock,
  Edit2,
  Power,
  Trash2,
  CalendarPlus,
  ArrowRight,
} from "lucide-react";

interface RoomCardProps {
  room: RoomData;
  isAdmin: boolean;
  onDeactivateToggle?: (room: RoomData) => void;
  onDelete?: (room: RoomData) => void;
}

export function RoomCard({
  room,
  isAdmin,
  onDeactivateToggle,
  onDelete,
}: RoomCardProps) {
  const isOccupied = room.isCurrentlyOccupied;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-5 transition-all duration-200 hover:shadow-lg ${
        room.isActive
          ? "border-slate-200/90 hover:border-blue-200"
          : "border-dashed border-slate-300 bg-slate-50/60 opacity-80"
      }`}
    >
      <div>
        {/* Header: Room Code & Status Badges */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {room.roomCode}
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1.5 group-hover:text-blue-600 transition-colors">
              {room.name}
            </h3>
          </div>

          <div className="flex flex-col items-end gap-1">
            {!room.isActive ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
                Deactivated
              </span>
            ) : isOccupied ? (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Occupied Now</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Available</span>
              </span>
            )}
          </div>
        </div>

        {/* Location & Capacity Meta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 mb-3.5">
          <div className="flex items-center space-x-1">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <span>{room.building}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Floor {room.floor}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-700">{room.capacity} seats</span>
          </div>
        </div>

        {/* Description */}
        {room.description && (
          <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
            {room.description}
          </p>
        )}

        {/* Equipment Badges */}
        {room.equipment && room.equipment.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {room.equipment.map((item, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Link
          href={`/rooms/${room.id}`}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          <span>View Details</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        {isAdmin ? (
          <div className="flex items-center space-x-1">
            {room.isActive && (
              <Link
                href={`/bookings/new?roomId=${room.id}`}
                title="Book this room"
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
              </Link>
            )}
            <Link
              href={`/rooms/${room.id}/edit`}
              title="Edit room specifications"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </Link>
            <button
              onClick={() => onDeactivateToggle?.(room)}
              title={room.isActive ? "Deactivate Room" : "Reactivate Room"}
              className={`p-1.5 rounded-lg transition-colors ${
                room.isActive
                  ? "text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                  : "text-emerald-600 hover:bg-emerald-50"
              }`}
            >
              <Power className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete?.(room)}
              title="Delete Room"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          room.isActive ? (
            <Link
              href={`/bookings/request?roomId=${room.id}`}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <span>Request Booking</span>
            </Link>
          ) : (
            <span className="text-[11px] text-slate-400">
              Unavailable
            </span>
          )
        )}
      </div>
    </div>
  );
}
