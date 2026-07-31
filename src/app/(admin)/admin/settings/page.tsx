import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { SchoolSettingsForm } from "@/components/admin/school-settings-form";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();

  const [{ data: settings }, { data: yearGroups }, { data: subjects }] =
    await Promise.all([
      supabase
        .from("school_settings")
        .select("id, school_name, platform_display_name, max_upload_bytes")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("school_year_groups")
        .select("id, label, sort_order, is_active")
        .order("sort_order"),
      supabase
        .from("school_subjects")
        .select("id, name, sort_order, is_active")
        .order("sort_order"),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School settings"
        description="Configure year groups, subjects and platform branding."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">Platform branding</CardTitle>
          <SchoolSettingsForm settings={settings ?? undefined} />
        </Card>

        <Card>
          <CardTitle className="mb-4">Year groups</CardTitle>
          <p className="mb-3 text-sm text-slate-500">
            Toggle which year groups are available in forms and CSV import.
          </p>
          <ul className="space-y-2">
            {(yearGroups ?? []).map((yg) => (
              <li
                key={yg.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-800">{yg.label}</span>
                <form
                  action={async () => {
                    "use server";
                    const { toggleYearGroupActiveAction } = await import(
                      "@/lib/actions/school-settings"
                    );
                    await toggleYearGroupActiveAction(yg.id, !yg.is_active);
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      yg.is_active
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {yg.is_active ? "Active" : "Inactive"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle className="mb-4">Subjects</CardTitle>
          <p className="mb-3 text-sm text-slate-500">
            Toggle active subjects or add custom ones for class creation.
          </p>
          <ul className="space-y-2">
            {(subjects ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-800">{s.name}</span>
                <form
                  action={async () => {
                    "use server";
                    const { toggleSubjectActiveAction } = await import(
                      "@/lib/actions/school-settings"
                    );
                    await toggleSubjectActiveAction(s.id, !s.is_active);
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      s.is_active
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {s.is_active ? "Active" : "Inactive"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
