"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinClassAction } from "@/lib/actions/student";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function JoinClassForm() {
  const [state, action, pending] = useActionState(joinClassAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row">
      <Input
        name="join_code"
        placeholder="Enter join code"
        required
        className="uppercase"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join class"}
      </Button>
      {state.error ? (
        <p className="text-sm text-rose-600 sm:basis-full">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-600 sm:basis-full">{state.success}</p>
      ) : null}
    </form>
  );
}
