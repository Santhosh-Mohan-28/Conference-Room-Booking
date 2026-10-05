"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserSession } from "@/types";
import {
  LayoutDashboard,
  DoorOpen,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  UserCircle,
  FileText,
  X,
  PlusCircle,
} from "lucide-react";

interface SidebarProps {
  user: UserSession;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      adminOnly: false,
    },
    {
      label: "Conference Rooms",
      href: "/rooms",
      icon: DoorOpen,
      adminOnly: false,
    },
    {
      label: "Room Availability",
      href: "/availability",
      icon: CalendarDays,
      adminOnly: false,
    },
    {
      label: "Book Room",
      href: "/bookings/new",
      icon: CalendarPlus,
      adminOnly: true,
      highlight: true,
    },
    {
      label: "Manage Bookings",
      href: "/bookings",
      icon: ClipboardList,
      adminOnly: true,
    },
    {
      label: "Audit Logs",
      href: "/audit-logs",
      icon: FileText,
      adminOnly: true,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: UserCircle,
      adminOnly: false,
    },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between py-5 px-3">
      <div className="space-y-6">
        {/* Mobile Header */}
        <div className="flex items-center justify-between px-3 lg:hidden">
          <span className="text-base font-bold text-slate-900">Menu</span>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Admin Action */}
        {isAdmin && (
          <div className="px-2">
            <Link
              href="/rooms/new"
              onClick={onClose}
              className="flex items-center justify-center space-x-2 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Conference Room</span>
            </Link>
          </div>
        )}

        {/* Navigation Section */}
        <nav className="space-y-1">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Navigation
          </div>
          {visibleNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-blue-600" : "text-slate-400"
                  }`}
                />
                <span>{item.label}</span>
                {item.adminOnly && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    Admin
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Role Footer Card */}
      <div className="px-3">
        <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200/70 text-xs">
          <div className="font-semibold text-slate-800">
            {isAdmin ? "Admin Console" : "Employee Portal"}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            {isAdmin
              ? "Full room scheduling, room management, and audit rights."
              : "Room inspection & real-time booking availability view."}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop permanent sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white min-h-[calc(100vh-4rem)]">
        {sidebarContent}
      </aside>

      {/* Mobile drawer with backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-10 flex flex-col">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
