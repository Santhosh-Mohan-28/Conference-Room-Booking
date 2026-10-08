"use client";

import React, { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Mail,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";

interface LoginFormProps {
  isDevBypass: boolean;
}

export function LoginForm({ isDevBypass }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  // State
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"EMAIL_INPUT" | "OTP_INPUT">("EMAIL_INPUT");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    errorParam ? "Authentication failed or access was denied. Please sign in." : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // OTP resend cooldown timer
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DEVELOPMENT BYPASS LOGIN (Email only -> Sign In)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMessage("Please enter a valid corporate email address.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await signIn("dev-email-login", {
        email: cleanEmail,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setErrorMessage(res.error);
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch (err: any) {
      setErrorMessage("An unexpected error occurred during sign in.");
      setIsLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCTION / OTP LOGIN (Step 1: Send OTP)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMessage("Please enter a valid company email address.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to dispatch verification code. Please try again.");
        if (data.details?.retryAfterSeconds) {
          setCountdown(data.details.retryAfterSeconds);
        }
        setIsLoading(false);
        return;
      }

      setStep("OTP_INPUT");
      setSuccessMessage(`A 6-digit verification code was sent to ${cleanEmail}.`);
      setCountdown(60);
    } catch (err: any) {
      setErrorMessage("Network error connecting to authentication service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCTION / OTP LOGIN (Step 2: Verify OTP)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage("Please enter the 6-digit verification code from your email.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await signIn("email-otp", {
        email: email.trim().toLowerCase(),
        otp: cleanOtp,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setErrorMessage(res.error);
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch (err: any) {
      setErrorMessage("An unexpected error occurred during verification.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      {/* Header Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25 border border-white/20">
            <Building2 className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Conference Room Booking
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Enterprise Workplace Scheduling
        </p>

        {isDevBypass && (
          <div className="mt-3 flex justify-center">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Development Mode &bull; Direct Email Login</span>
            </span>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-200">
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3 text-sm text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Authentication Notice</p>
                <p className="text-xs mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && !errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Verification Code Dispatched</p>
                <p className="text-xs mt-0.5 leading-relaxed">{successMessage}</p>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* MODE A: DEVELOPMENT BYPASS (Email -> Login Button ONLY)       */}
          {/* ───────────────────────────────────────────────────────────── */}
          {isDevBypass ? (
            <form onSubmit={handleDevLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={isLoading}
                    className="block w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Enter any company email to authenticate instantly in local development.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Login</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ───────────────────────────────────────────────────────────── */
            /* MODE B: PRODUCTION OTP (Email -> Send OTP -> Enter OTP)        */
            /* ───────────────────────────────────────────────────────────── */
            <>
              {step === "EMAIL_INPUT" && (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                    >
                      Corporate Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-5 h-5" />
                      </div>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        disabled={isLoading}
                        className="block w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      We will send a secure, single-use 6-digit verification code to this address.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {step === "OTP_INPUT" && (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="otp"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                      >
                        Enter 6-Digit Code
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("EMAIL_INPUT");
                          setOtp("");
                          setErrorMessage(null);
                          setSuccessMessage(null);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        <span>Change Email</span>
                      </button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <input
                        id="otp"
                        name="otp"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoComplete="one-time-code"
                        autoFocus
                        required
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="123456"
                        disabled={isLoading}
                        className="block w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 placeholder-slate-400 text-lg font-mono tracking-widest text-center focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-slate-50"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        Sent to: <strong className="text-slate-700">{email}</strong>
                      </span>
                      <span>Expires in 5 mins</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otp.trim().length !== 6}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center border-t border-slate-100">
                    {countdown > 0 ? (
                      <p className="text-xs text-slate-400">
                        Resend code available in{" "}
                        <span className="font-mono font-bold text-slate-600">
                          {countdown}s
                        </span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendOtp()}
                        disabled={isLoading}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center space-x-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Resend Verification Code</span>
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}

          {/* Security Notice Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center space-x-1.5 text-slate-400 text-xs">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span>Secure Enterprise Access</span>
          </div>
        </div>

        {/* Audit Compliance Notice */}
        <p className="mt-4 text-center text-xs text-slate-400">
          Internal company use only. All authentication attempts are logged and audited.
        </p>
      </div>
    </div>
  );
}
