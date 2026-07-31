import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { logoutAction } from "@/lib/actions/auth";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <AppShell profile={profile}>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Settings"
          description="Your LitCoach profile details."
        />
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1.5 block text-slate-500">First name</span>
              <Input value={profile.first_name} readOnly />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-slate-500">Last name</span>
              <Input value={profile.last_name} readOnly />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-500">Email</span>
            <Input value={profile.email} readOnly />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-500">Role</span>
            <Input value={profile.role} readOnly className="capitalize" />
          </label>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
