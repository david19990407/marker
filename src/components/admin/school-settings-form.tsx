"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSchoolSettingsAction } from "@/lib/actions/school-settings";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function SchoolSettingsForm({
  settings,
}: {
  settings?: {
    school_name: string;
    platform_display_name: string;
    max_upload_bytes: number;
  };
}) {
  const [state, action, pending] = useActionState(
    updateSchoolSettingsAction,
    initial,
  );

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
        <span className="mb-1.5 block text-slate-500">School name</span>
        <Input
          name="school_name"
          required
          defaultValue={settings?.school_name ?? "My School"}
          placeholder="e.g. Greenfield Academy"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-slate-500">Platform display name</span>
        <Input
          name="platform_display_name"
          required
          defaultValue={settings?.platform_display_name ?? "Homework Passport"}
          placeholder="e.g. Homework Passport"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
