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
    max_upload_bytes?: number;
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
        <span className="mb-1.5 block font-medium text-slate-700">
          School name
        </span>
        <span className="mb-1.5 block text-xs text-slate-500">
          The organisation using the platform. Shown as a subtitle on login and
          dashboards (for example “Homework Passport for Presdales School”).
        </span>
        <Input
          name="school_name"
          required
          defaultValue={settings?.school_name ?? ""}
          placeholder="e.g. Presdales School"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">
          Platform display name
        </span>
        <span className="mb-1.5 block text-xs text-slate-500">
          The product name shown to users in the sidebar, browser title, login
          heading and navigation. Defaults to Homework Passport.
        </span>
        <Input
          name="platform_display_name"
          required
          defaultValue={
            settings?.platform_display_name ?? "Homework Passport"
          }
          placeholder="Homework Passport"
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </Button>
    </form>
  );
}
