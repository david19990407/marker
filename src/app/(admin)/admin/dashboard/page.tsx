import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function AdminDashboardPage() {
  const profile = await requireProfile(["admin"]);
  const supabase = await createClient();

  const [
    { count: userCount },
    { count: teacherCount },
    { count: studentCount },
    { count: classCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "teacher")
      .eq("is_active", true),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "student")
      .eq("is_active", true),
    supabase
      .from("classes")
      .select("*", { count: "exact", head: true })
      .eq("archived", false),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description="Manage users, classes and school-wide access for LitCoach."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total users", value: userCount ?? 0 },
          { label: "Active teachers", value: teacherCount ?? 0 },
          { label: "Active students", value: studentCount ?? 0 },
          { label: "Active classes", value: classCount ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold text-slate-900">Create a user</h2>
          <p className="mt-2 text-sm text-slate-500">
            Invite a teacher or student by email.
          </p>
          <Link href="/admin/users/new" className="mt-4 inline-block">
            <Button>New user</Button>
          </Link>
        </Card>
        <Card>
          <h2 className="font-semibold text-slate-900">Bulk import</h2>
          <p className="mt-2 text-sm text-slate-500">
            Upload a CSV to invite many users at once.
          </p>
          <Link href="/admin/users/import" className="mt-4 inline-block">
            <Button variant="secondary">Import CSV</Button>
          </Link>
        </Card>
        <Card>
          <h2 className="font-semibold text-slate-900">Classes</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create classes and assign students.
          </p>
          <Link href="/admin/classes" className="mt-4 inline-block">
            <Button variant="outline">Manage classes</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
