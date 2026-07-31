"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction, type ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Email</span>
        <Input name="email" type="email" required autoComplete="email" />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
