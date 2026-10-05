"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Building2, ShieldCheck, UserCheck, AlertCircle, ArrowRight, Lock } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    errorParam ? "Authentication failed or access was denied. Please try again." : null
  );

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await signIn("azure-ad", { callbackUrl: "/dashboard" });
    } catch (err: any) {
      setErrorMessage("Could not connect to Microsoft Entra ID. Please verify your connection.");
      setIsLoading(false);
    }
  };

  const handleDevMockLogin = async (role: "ADMIN" | "EMPLOYEE") => {
    setIsLoading(true);
    setErrorMessage(null);
    const email = role === "ADMIN" ? "admin@enterprise.com" : "employee@enterprise.com";

    const res = await signIn("dev-mock-login", {
      email,
      role,
      callbackUrl: "/dashboard",
      redirect: true,
    });

    if (res?.error) {
      setErrorMessage(res.error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Company Logo Placeholder & Branding */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25 border border-white/20">
            <Building2 className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Conference Room Booking
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Enterprise internal workplace scheduling & room management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-200">
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3 text-sm text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sign in Notice</p>
                <p className="text-xs mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Primary Action: Sign in with Microsoft */}
          <div className="space-y-4">
            <button
              onClick={handleMicrosoftLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-3 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm shadow-xs transition-all hover:border-slate-400 disabled:opacity-50 group"
            >
              {/* Microsoft Official Quad-Color Icon SVG */}
              <svg className="w-5 h-5" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span>Sign in with Microsoft Entra ID</span>
            </button>

            <div className="text-center text-xs text-slate-400 flex items-center justify-center space-x-1.5 pt-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Single Sign-On protected by Company Tenant</span>
            </div>
          </div>

          {/* Development Quick Role Switch (strictly isolated in dev) */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Development Test Access
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                LOCAL DEV
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Quickly switch between pre-seeded roles to test authorization without active Entra ID secrets:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDevMockLogin("ADMIN")}
                className="flex items-center justify-between p-3 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-left transition-colors group"
              >
                <div>
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-900">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Test Admin</span>
                  </div>
                  <div className="text-[11px] text-indigo-700">admin@enterprise.com</div>
                </div>
                <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDevMockLogin("EMPLOYEE")}
                className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-left transition-colors group"
              >
                <div>
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-900">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>Test Employee</span>
                  </div>
                  <div className="text-[11px] text-emerald-700">employee@enterprise.com</div>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <p className="mt-4 text-center text-xs text-slate-400">
          Internal company use only. All actions are logged and audited.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm />
    </Suspense>
  );
}
