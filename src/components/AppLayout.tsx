"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { ToastProvider } from "./Toast";
import { ChatbotDrawer } from "./ChatbotDrawer";
import { UserSession } from "@/types";
import { Loader2 } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
  requireAdminRole?: boolean;
}

export function AppLayout({ children, requireAdminRole = false }: AppLayoutProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            Verifying enterprise session...
          </p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    if (typeof window !== "undefined") {
      router.push("/login");
    }
    return null;
  }

  const user = session.user as unknown as UserSession;

  if (requireAdminRole && user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar user={user} onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
        <div className="flex flex-1">
          <Sidebar
            user={user}
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          />
          <main className="flex-1 p-6 md:p-8 flex items-center justify-center">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                !
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
              <p className="text-sm text-slate-600 mb-6">
                You are signed in as an <strong>Employee</strong>. This administrative section
                is restricted to authorized system administrators only.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                Return to Dashboard
              </button>
            </div>
          </main>
        </div>
        <ChatbotDrawer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={user} onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      <div className="flex flex-1">
        <Sidebar
          user={user}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
      <ChatbotDrawer />
    </div>
  );
}
