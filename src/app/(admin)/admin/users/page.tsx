import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import type { UserRole } from "@/lib/types";
import { getActiveYearGroups } from "@/lib/school/settings";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    year_group?: string;
  }>;
}) {
  await requireProfile(["admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const yearGroups = await getActiveYearGroups();

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (params.role && ["admin", "teacher", "student"].includes(params.role)) {
    query = query.eq("role", params.role as UserRole);
  }
  if (params.status === "active") query = query.eq("is_active", true);
  if (params.status === "inactive") query = query.eq("is_active", false);
  if (params.year_group) query = query.eq("year_group", params.year_group);
  if (params.q) {
    const q = `%${params.q}%`;
    query = query.or(
      `email.ilike.${q},first_name.ilike.${q},last_name.ilike.${q},display_name.ilike.${q}`,
    );
  }

  const { data: users } = await query;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search, invite and manage teachers, students and admins."
        action={
          <div className="flex gap-2">
            <Link href="/admin/users/import">
              <Button variant="outline">Import CSV</Button>
            </Link>
            <Link href="/admin/users/new">
              <Button>New user</Button>
            </Link>
          </div>
        }
      />

      <Card>
        <form
          method="get"
          className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
        >
          <Input
            name="q"
            placeholder="Search name or email"
            defaultValue={params.q ?? ""}
          />
          <select
            name="role"
            defaultValue={params.role ?? ""}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
          <select
            name="year_group"
            defaultValue={params.year_group ?? ""}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All year groups</option>
            {yearGroups.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {!users?.length ? (
          <p className="p-6 text-sm text-slate-500">No users found</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Year</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {user.display_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">{user.year_group ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
