"use client";

import React from "react";
import { signOut } from "next-auth/react";
import { UserSession } from "@/types";
import {
  Building2,
  Clock,
  Shield,
  User,
  LogOut,
  Menu,
} from "lucide-react";
import Link from "next/link";

interface NavbarProps {
  user: UserSession;
  onMenuToggle?: () => void;
}

export function Navbar({ user, onMenuToggle }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur transition-all">
      <div className="flex items-center space-x-3">
        <button
          onClick={onMenuToggle}
          type="button"
          aria-label="Toggle navigation menu"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="flex items-center space-x-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <span className="text-base font-bold tracking-tight text-slate-900">
              Enterprise Rooms
            </span>
            <span className="block text-[11px] font-medium text-slate-500 leading-tight">
              Conference Booking Portal
            </span>
          </div>
        </Link>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-5">
        {/* Company Timezone Pill */}
        <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-medium text-slate-600">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span>Asia/Kolkata (IST)</span>
        </div>

        {/* User Role & Profile */}
        <div className="flex items-center space-x-3 pl-2 sm:pl-3 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-900 leading-tight">
              {user.name}
            </div>
            <div className="text-[11px] text-slate-500 leading-tight">
              {user.email}
            </div>
          </div>

          {/* Role Badge */}
          {user.role === "ADMIN" ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm">
              <Shield className="w-3 h-3 text-indigo-600" />
              <span>ADMIN</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <User className="w-3 h-3 text-emerald-600" />
              <span>EMPLOYEE</span>
            </span>
          )}

          {/* Logout Button */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
