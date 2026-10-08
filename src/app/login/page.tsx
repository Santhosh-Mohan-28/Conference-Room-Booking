import React, { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  const isDevBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_AUTH === "true";

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm isDevBypass={isDevBypass} />
    </Suspense>
  );
}
