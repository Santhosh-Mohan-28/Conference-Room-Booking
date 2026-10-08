"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserData } from "@/types";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Search,
  Filter,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  UserPlus,
  Calendar,
  X,
  AlertTriangle,
} from "lucide-react";
import { formatCompanyTime } from "@/lib/timezone";

export default function UserMasterPage() {
  const { success, error: toastError } = useToast();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Grant Access Modal
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"EMPLOYEE" | "ADMIN">("EMPLOYEE");

  // Confirm Action Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: "danger" | "warning" | "info";
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    variant: "info",
    onConfirm: async () => {},
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (roleFilter !== "ALL") params.append("role", roleFilter);
      if (statusFilter !== "ALL") params.append("status", statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to load users");
      }

      setUsers(json.data?.users || []);
    } catch (err: any) {
      toastError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const inactive = users.filter((u) => !u.isActive).length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    const superAdmins = users.filter((u) => u.isSuperAdmin).length;
    return { total, active, inactive, admins, superAdmins };
  }, [users]);

  // Grant Access Handler
  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toastError("Please enter an employee email address.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          role: newRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to grant access");
      }

      success(`Access granted successfully to ${newEmail}`);
      setIsGrantModalOpen(false);
      setNewEmail("");
      setNewName("");
      setNewRole("EMPLOYEE");
      fetchUsers();
    } catch (err: any) {
      toastError(err.message || "Failed to grant access");
    } finally {
      setActionLoading(false);
    }
  };

  // Role Change Handler
  const promptRoleChange = (user: UserData) => {
    if (user.isSuperAdmin) {
      toastError("Super Administrators cannot be modified or demoted.");
      return;
    }

    const targetRole = user.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";
    const isPromote = targetRole === "ADMIN";

    setConfirmDialog({
      isOpen: true,
      title: isPromote ? "Promote User to Administrator" : "Demote User to Employee",
      message: isPromote
        ? `Are you sure you want to promote ${user.name} (${user.email}) to Administrator? They will be granted full permissions to manage conference rooms, approve booking requests, and create direct bookings.`
        : `Are you sure you want to demote ${user.name} (${user.email}) to Employee? They will no longer have administrative privileges and must submit booking requests for review.`,
      confirmLabel: isPromote ? "Promote to Admin" : "Demote to Employee",
      variant: isPromote ? "info" : "warning",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await fetch(`/api/admin/users/${user.id}/role`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: targetRole }),
          });

          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || "Failed to update role");
          }

          success(`User role updated to ${targetRole}`);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchUsers();
        } catch (err: any) {
          toastError(err.message || "Failed to update role");
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // Status Change Handler
  const promptStatusChange = (user: UserData) => {
    if (user.isSuperAdmin) {
      toastError("Super Administrators are strictly protected and cannot be deactivated.");
      return;
    }

    const targetStatus = !user.isActive;

    setConfirmDialog({
      isOpen: true,
      title: targetStatus ? "Activate User Account" : "Deactivate User Account",
      message: targetStatus
        ? `Are you sure you want to activate ${user.name} (${user.email})? They will be granted immediate access to log in and use the Conference Room Booking application.`
        : `Are you sure you want to deactivate ${user.name} (${user.email})? They will be blocked from logging in and accessing the application until reactivated.`,
      confirmLabel: targetStatus ? "Activate Account" : "Deactivate Account",
      variant: targetStatus ? "info" : "danger",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await fetch(`/api/admin/users/${user.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: targetStatus }),
          });

          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || "Failed to update status");
          }

          success(`User account ${targetStatus ? "activated" : "deactivated"}`);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          fetchUsers();
        } catch (err: any) {
          toastError(err.message || "Failed to update status");
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  return (
    <AppLayout requireSuperAdminRole={true}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                User Master & Access Control
              </h1>
            </div>
            <p className="text-sm text-slate-500">
              Manage enterprise employee access, role promotions, account activations, and Super Administrator target protection.
            </p>
          </div>

          <div className="flex items-center space-x-3 self-start sm:self-auto">
            <button
              onClick={fetchUsers}
              title="Refresh users list"
              className="p-2.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setIsGrantModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Grant New Access</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Users</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">Company directory accounts</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Active Accounts</span>
              <UserCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600">{metrics.active}</div>
            <div className="text-[11px] text-emerald-600/80 mt-1">Granted application access</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Inactive / Pending</span>
              <UserX className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600">{metrics.inactive}</div>
            <div className="text-[11px] text-amber-600/80 mt-1">Pending approval or disabled</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Administrators</span>
              <Shield className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-black text-indigo-600">
              {metrics.admins}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                ({metrics.superAdmins} Super)
              </span>
            </div>
            <div className="text-[11px] text-indigo-600/80 mt-1">Privileged system access</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search users by full name or email address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-1.5 text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              <span>Role:</span>
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Administrator</option>
              <option value="EMPLOYEE">Employee</option>
            </select>

            <div className="flex items-center space-x-1.5 text-slate-500 ml-2">
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive / Pending</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-5">User</th>
                  <th className="py-3.5 px-5">Role</th>
                  <th className="py-3.5 px-5">Access Status</th>
                  <th className="py-3.5 px-5">Registered</th>
                  <th className="py-3.5 px-5 text-right">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                      Loading company user accounts...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No user accounts found matching the current criteria.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const initials = user.name
                      ? user.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : user.email[0].toUpperCase();

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* User Identity */}
                        <td className="py-4 px-5">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                              {initials}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center space-x-1.5">
                                <span>{user.name}</span>
                                {user.isSuperAdmin && (
                                  <span title="Configured Super Administrator">
                                    <ShieldCheck className="w-4 h-4 text-indigo-600 inline" />
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span>{user.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-4 px-5">
                          {user.isSuperAdmin ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                              <ShieldCheck className="w-3 h-3 text-indigo-600" />
                              <span>Super Admin</span>
                            </span>
                          ) : user.role === "ADMIN" ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                              <Shield className="w-3 h-3 text-blue-600" />
                              <span>Administrator</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              <span>Employee</span>
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5">
                          {user.isActive ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active Access</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>Inactive / Pending</span>
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="py-4 px-5 text-slate-500 text-[11px]">
                          {formatCompanyTime(user.createdAt, "MMM d, yyyy")}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right">
                          {user.isSuperAdmin ? (
                            <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 select-none">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Target Protected</span>
                            </span>
                          ) : (
                            <div className="flex items-center justify-end space-x-2">
                              {/* Role Button */}
                              <button
                                onClick={() => promptRoleChange(user)}
                                disabled={actionLoading}
                                title={
                                  user.role === "ADMIN"
                                    ? "Demote to Employee"
                                    : "Promote to Administrator"
                                }
                                className={`px-2.5 py-1.5 rounded-xl font-semibold text-[11px] border transition-colors flex items-center space-x-1 ${
                                  user.role === "ADMIN"
                                    ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                }`}
                              >
                                {user.role === "ADMIN" ? (
                                  <>
                                    <ArrowDownRight className="w-3 h-3 text-slate-500" />
                                    <span>Demote</span>
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpRight className="w-3 h-3 text-blue-600" />
                                    <span>Make Admin</span>
                                  </>
                                )}
                              </button>

                              {/* Status Button */}
                              <button
                                onClick={() => promptStatusChange(user)}
                                disabled={actionLoading}
                                title={user.isActive ? "Deactivate account" : "Activate account"}
                                className={`px-2.5 py-1.5 rounded-xl font-semibold text-[11px] border transition-colors flex items-center space-x-1 ${
                                  user.isActive
                                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                }`}
                              >
                                {user.isActive ? (
                                  <>
                                    <XCircle className="w-3 h-3 text-rose-600" />
                                    <span>Deactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>Grant Access</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Target Protection Notice */}
        <div className="bg-slate-100/80 border border-slate-200/80 rounded-2xl p-4 flex items-start space-x-3 text-xs text-slate-600">
          <ShieldAlert className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-900 block">
              Super Administrator Target Protection Policy
            </span>
            <p className="leading-relaxed text-slate-600">
              Users configured as Super Administrators via server environment variable (<code>SUPER_ADMIN_EMAILS</code>) cannot be modified, demoted, or deactivated through the interface. Any server-level mutation against protected accounts is rejected with HTTP 403 Forbidden.
            </p>
          </div>
        </div>
      </div>

      {/* Grant Access Modal */}
      {isGrantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Grant Employee Access</h3>
                    <p className="text-xs text-slate-500">Pre-provision or activate an account</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsGrantModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleGrantAccess} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Company Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="employee@enterprise.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="EMPLOYEE">Employee (Can submit booking requests)</option>
                    <option value="ADMIN">Administrator (Can directly book and manage rooms)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsGrantModalOpen(false)}
                    className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Grant Access</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        isLoading={actionLoading}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </AppLayout>
  );
}
