import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubjectIcon } from "@/components/shared/subject-icon";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { getActiveYearGroups } from "@/lib/school/settings";

export default async function TeacherClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ year_group?: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const params = await searchParams;
  const supabase = await createClient();
  const yearGroups = await getActiveYearGroups();

  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select(
      "membership_role, classes(id, name, subject, year_group, join_code, archived, created_at, colour_hex, subject_id)",
    )
    .eq("teacher_id", profile.id);

  const classesByIdMap = new Map<
    string,
    {
      id: string;
      name: string;
      subject: string;
      year_group: string | null;
      join_code: string;
      archived: boolean;
      created_at: string;
      colour_hex: string | null;
      subject_id: string | null;
      membership_role: string;
    }
  >();
  for (const row of ctRows ?? []) {
    const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    if (c && !classesByIdMap.has(c.id)) {
      classesByIdMap.set(c.id, { ...c, membership_role: row.membership_role });
    }
  }

  const { data: legacyClasses } = await supabase
    .from("classes")
    .select(
      "id, name, subject, year_group, join_code, archived, created_at, colour_hex, subject_id",
    )
    .eq("teacher_id", profile.id);

  for (const c of legacyClasses ?? []) {
    if (!classesByIdMap.has(c.id)) {
      classesByIdMap.set(c.id, { ...c, membership_role: "lead_teacher" });
    }
  }

  const classes = Array.from(classesByIdMap.values())
    .filter((c) =>
      params.year_group ? c.year_group === params.year_group : true,
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const classIds = classes.map((c) => c.id);
  const subjectIds = Array.from(
    new Set(classes.map((c) => c.subject_id).filter(Boolean)),
  ) as string[];

  const [{ data: members }, { data: subjects }] = await Promise.all([
    classIds.length
      ? supabase.from("class_members").select("class_id").in("class_id", classIds)
      : Promise.resolve({ data: [] as { class_id: string }[] }),
    subjectIds.length
      ? supabase
          .from("school_subjects")
          .select("id, icon_type, icon_value, colour, icon_key, icon_storage_path")
          .in("id", subjectIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            icon_type: string | null;
            icon_value: string | null;
            colour: string | null;
            icon_key: string | null;
            icon_storage_path: string | null;
          }>,
        }),
  ]);

  const counts = new Map<string, number>();
  (members ?? []).forEach((m) => {
    counts.set(m.class_id, (counts.get(m.class_id) ?? 0) + 1);
  });
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Classes"
        description="View classes, share join codes and manage members."
        action={
          <Link href="/teacher/classes/new">
            <Button>New class</Button>
          </Link>
        }
      />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Year group</span>
            <select
              name="year_group"
              defaultValue={params.year_group ?? ""}
              className="h-11 min-w-48 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All year groups</option>
              {yearGroups.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>

      {!classes?.length ? (
        <Card>
          <p className="text-sm text-slate-500">No classes yet</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => {
            const subject = c.subject_id
              ? subjectById.get(c.subject_id)
              : undefined;
            const colour =
              subject?.colour || c.colour_hex || "#7C3AED";
            return (
              <Card key={c.id} className="relative overflow-hidden">
                <div
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ backgroundColor: colour }}
                />
                <div className="mb-2 flex items-start gap-3">
                  <SubjectIcon
                    name={c.subject}
                    iconType={subject?.icon_type}
                    iconValue={
                      subject?.icon_value ||
                      subject?.icon_storage_path ||
                      subject?.icon_key
                    }
                    colour={colour}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-slate-900">{c.name}</h2>
                      <div className="flex gap-1.5">
                        {c.membership_role !== "lead_teacher" ? (
                          <Badge tone="neutral" className="capitalize">
                            {c.membership_role.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                        <Badge tone={c.archived ? "neutral" : "success"}>
                          {c.archived ? "Archived" : "Active"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500">
                      {c.subject}
                      {c.year_group ? ` · ${c.year_group}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Join code: {c.join_code} · {counts.get(c.id) ?? 0} students
                    </p>
                    <Link
                      href={`/teacher/classes/${c.id}`}
                      className="mt-4 inline-block"
                    >
                      <Button size="sm" variant="secondary">
                        Open
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
