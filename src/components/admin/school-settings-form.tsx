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
    primary_colour?: string;
    secondary_colour?: string;
    accent_colour?: string;
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
          dashboards.
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
          Product name in the sidebar, browser title, login heading and
          navigation.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">
            Primary colour
          </span>
          <Input
            name="primary_colour"
            type="color"
            required
            defaultValue={settings?.primary_colour ?? "#7C3AED"}
            className="h-11 cursor-pointer p-1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">
            Secondary colour
          </span>
          <Input
            name="secondary_colour"
            type="color"
            required
            defaultValue={settings?.secondary_colour ?? "#4F46E5"}
            className="h-11 cursor-pointer p-1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">
            Accent colour
          </span>
          <Input
            name="accent_colour"
            type="color"
            required
            defaultValue={settings?.accent_colour ?? "#0D9488"}
            className="h-11 cursor-pointer p-1"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        These colours drive buttons, sidebar accents and page backgrounds across
        admin, teacher and student views. Prefer colours with good contrast.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </Button>
    </form>
  );
}
