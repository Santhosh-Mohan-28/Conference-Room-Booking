"use client";

import React from "react";
import { AppLayout } from "@/components/AppLayout";
import { useSession, signOut } from "next-auth/react";
import { UserSession } from "@/types";
import {
  UserCircle,
  Mail,
  Shield,
  Key,
  LogOut,
  Building2,
  Lock,
  CheckCircle2,
} from "lucide-react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user as unknown as UserSession;
  const isAdmin = user?.role === "ADMIN";

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            User Profile
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Your authenticated corporate enterprise account details and directory role.
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-100 flex items-start space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-2xl flex-shrink-0 shadow-md shadow-blue-500/20">
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-900">{user?.name}</h2>
                {isAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    ADMINISTRATOR
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    EMPLOYEE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
            </div>
          </div>

          {/* Details Table */}
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
              <span className="text-slate-500 flex items-center space-x-2">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>Email Address:</span>
              </span>
              <span className="font-semibold text-slate-800">{user?.email}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
              <span className="text-slate-500 flex items-center space-x-2">
                <Shield className="w-4 h-4 text-slate-400" />
                <span>Assigned Role:</span>
              </span>
              <span className="font-bold text-slate-800">{user?.role}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
              <span className="text-slate-500 flex items-center space-x-2">
                <Key className="w-4 h-4 text-slate-400" />
                <span>Microsoft User ID (OID):</span>
              </span>
              <span className="font-mono text-slate-600 text-[11px]">
                {user?.microsoftUserId || "Configured via Entra ID"}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
              <span className="text-slate-500 flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span>Microsoft Tenant ID:</span>
              </span>
              <span className="font-mono text-slate-600 text-[11px]">
                {user?.microsoftTenantId || "Configured via Entra ID"}
              </span>
            </div>

            {/* Role Immutability Notice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start space-x-3 text-xs text-slate-600">
              <Lock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-700">Role Management Policy</span>
                <p className="mt-0.5 leading-relaxed text-[11px]">
                  User roles are immutable and strictly governed by corporate IT administration.
                  Users cannot elevate or modify their own roles.
                </p>
              </div>
            </div>

            {/* Logout Action */}
            <div className="pt-4 flex justify-end">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out from Enterprise</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
