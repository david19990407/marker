"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePasswordAction, type ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">New password</span>
        <Input name="password" type="password" required minLength={8} />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Confirm password</span>
        <Input name="confirmPassword" type="password" required minLength={8} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
