"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function LoginForm({ errorFromQuery }: { errorFromQuery?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      {(state.error || errorFromQuery) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error ||
            (errorFromQuery === "inactive"
              ? "This account has been deactivated."
              : errorFromQuery)}
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Email</span>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@school.edu"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </label>
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-brand-700 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-slate-400">
        Accounts are created by an administrator. Self-registration is disabled.
      </p>
    </form>
  );
}
