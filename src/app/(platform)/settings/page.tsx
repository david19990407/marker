"use client";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your LitCoach AI profile and preferences."
      />

      <Card>
        <CardTitle>Profile</CardTitle>
        <CardDescription className="mt-1">
          Demo profile stored locally until Supabase Auth is connected.
        </CardDescription>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Name</span>
            <Input defaultValue={user?.name} readOnly />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Email</span>
            <Input defaultValue={user?.email} readOnly />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Role</span>
            <Input defaultValue={user?.role} readOnly className="capitalize" />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Exam board</span>
            <Input defaultValue={user?.examBoard ?? "—"} readOnly />
          </label>
        </div>
      </Card>

      <Card>
        <CardTitle>Preferences</CardTitle>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
            <input type="checkbox" defaultChecked className="accent-brand-600" />
            Email me when essay feedback is ready
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
            <input type="checkbox" defaultChecked className="accent-brand-600" />
            Weekly revision reminders
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
            <input type="checkbox" className="accent-brand-600" />
            Show Quick Revision Mode by default
          </label>
        </div>
      </Card>

      <Card>
        <CardTitle>Session</CardTitle>
        <CardDescription className="mt-1">
          Sign out of the demo session on this device.
        </CardDescription>
        <Button className="mt-4" variant="outline" onClick={logout}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
