import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassSummary } from "@/components/shared/class-summary";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function StudentClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!membership) notFound();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!classRow) notFound();

  const [{ data: subjectRow }, { data: classTeachers }, { data: assignments }] =
    await Promise.all([
      classRow.subject_id
        ? supabase
            .from("school_subjects")
            .select(
              "id, name, icon_type, icon_value, colour, icon_key, icon_storage_path",
            )
            .eq("id", classRow.subject_id)
            .maybeSingle()
        : supabase
            .from("school_subjects")
            .select(
              "id, name, icon_type, icon_value, colour, icon_key, icon_storage_path",
            )
            .ilike("name", classRow.subject)
            .limit(1)
            .maybeSingle(),
      supabase
        .from("class_teachers")
        .select(
          "membership_role, teacher:profiles!class_teachers_teacher_id_fkey(display_name)",
        )
        .eq("class_id", id),
      supabase
        .from("assignments")
        .select("id, title, due_at, status")
        .eq("class_id", id)
        .eq("status", "published")
        .order("due_at", { ascending: true }),
    ]);

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status")
        .eq("student_id", profile.id)
        .in("assignment_id", assignmentIds)
    : { data: [] as Array<{ id: string; assignment_id: string; status: string }> };

  const subByAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );
  const returnedIds = (submissions ?? [])
    .filter((s) => s.status === "returned" || s.status === "marked")
    .map((s) => s.id);
  const { data: feedback } = returnedIds.length
    ? await supabase
        .from("feedback")
        .select("submission_id, status")
        .in("submission_id", returnedIds)
        .eq("status", "released")
    : { data: [] as Array<{ submission_id: string; status: string }> };
  const feedbackIds = new Set((feedback ?? []).map((f) => f.submission_id));

  const colour = subjectRow?.colour || classRow.colour_hex || "#7C3AED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={classRow.name}
        description={classRow.subject}
        action={
          <Link href="/student/dashboard">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />

      <Card>
        <ClassSummary
          name={classRow.name}
          subject={classRow.subject}
          yearGroup={classRow.year_group}
          colourHex={classRow.colour_hex}
          subjectIconType={subjectRow?.icon_type}
          subjectIconValue={
            subjectRow?.icon_value ||
            subjectRow?.icon_storage_path ||
            subjectRow?.icon_key
          }
          subjectColour={colour}
          archived={classRow.archived}
          showAdminManagedNote={false}
        />
      </Card>

      <Card>
        <CardTitle className="mb-4">Teachers</CardTitle>
        <ul className="space-y-2">
          {(classTeachers ?? []).map((ct, index) => {
            const teacher = Array.isArray(ct.teacher) ? ct.teacher[0] : ct.teacher;
            return (
              <li
                key={`${ct.membership_role}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {teacher?.display_name ?? "Teacher"}
                </span>
                <Badge tone="brand" className="capitalize">
                  {ct.membership_role.replace(/_/g, " ")}
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle className="mb-4">Homework</CardTitle>
        {!assignments?.length ? (
          <p className="text-sm text-slate-500">No published homework yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const sub = subByAssignment.get(a.id);
              const hasFeedback = sub ? feedbackIds.has(sub.id) : false;
              return (
                <li key={a.id}>
                  <Link
                    href={`/student/homework/${a.id}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500">
                        {a.due_at
                          ? `Due ${new Date(a.due_at).toLocaleString("en-GB")}`
                          : "No due date"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {hasFeedback ? (
                        <Badge tone="success">Feedback</Badge>
                      ) : null}
                      <Badge tone="neutral">
                        {sub?.status ?? "not submitted"}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
