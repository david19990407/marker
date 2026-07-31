"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GraduationCap, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import type { UserRole } from "@/lib/types";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const preferred = (params.get("role") as UserRole | null) ?? "student";
  const [role, setRole] = useState<UserRole>(
    preferred === "teacher" ? "teacher" : "student",
  );

  function handleLogin() {
    login(role);
    const next = params.get("next");
    router.replace(next || "/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),#fafafa] px-4">
      <Card className="w-full max-w-md animate-fade-up p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-slate-900">
            Sign in to LitCoach AI
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Demo authentication for the MVP. Choose a role to explore the
            platform with sample data.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setRole("student")}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
              role === "student"
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <Users className="h-5 w-5 text-brand-600" />
            <div>
              <p className="font-medium text-slate-900">Student</p>
              <p className="text-sm text-slate-500">Alex Morgan · Year 11 · AQA</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setRole("teacher")}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
              role === "teacher"
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <GraduationCap className="h-5 w-5 text-brand-600" />
            <div>
              <p className="font-medium text-slate-900">Teacher</p>
              <p className="text-sm text-slate-500">Ms Harper · Upload & analytics</p>
            </div>
          </button>
        </div>

        <Button className="mt-6 w-full" size="lg" onClick={handleLogin}>
          Continue as {role}
        </Button>
        <p className="mt-4 text-center text-xs text-slate-400">
          Connect Supabase Auth later using the same role model in{" "}
          <code className="rounded bg-slate-100 px-1">profiles</code>.
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
