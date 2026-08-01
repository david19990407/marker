import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassCard } from "@/components/shared/class-card";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import { getBranding } from "@/lib/school/branding";
import { currentTimeMs } from "@/lib/utils/time";

export default async function StudentDashboardPage() {
  const [profile, branding] = await Promise.all([
    requireProfile(["student"]),
    getBranding(),
  ]);
  const supabase = await createClient();
  const nowMs = currentTimeMs();

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id")
    .eq("student_id", profile.id);
  const classIds = (memberships ?? []).map((m) => m.class_id);

  const { data: classes } = classIds.length
    ? await supabase
        .from("classes")
        .select(
          "id, name, subject, year_group, colour_hex, archived, subject_id, teacher_id",
        )
        .in("id", classIds)
        .eq("archived", false)
        .order("name")
    : { data: [] as Array<{
        id: string;
        name: string;
        subject: string;
        year_group: string | null;
        colour_hex: string | null;
        archived: boolean;
        subject_id: string | null;
        teacher_id: string;
      }> };

  const subjectIds = Array.from(
    new Set((classes ?? []).map((c) => c.subject_id).filter(Boolean)),
  ) as string[];

  const [{ data: subjects }, { data: classTeachers }, { data: assignments }] =
    await Promise.all([
      subjectIds.length
        ? supabase
            .from("school_subjects")
            .select(
              "id, name, icon_type, icon_value, colour, icon_key, icon_storage_path",
            )
            .in("id", subjectIds)
        : Promise.resolve({ data: [] as Array<{
            id: string;
            name: string;
            icon_type: string | null;
            icon_value: string | null;
            colour: string | null;
            icon_key: string | null;
            icon_storage_path: string | null;
          }> }),
      classIds.length
        ? supabase
            .from("class_teachers")
            .select("class_id, teacher_id, membership_role")
            .in("class_id", classIds)
        : Promise.resolve({
            data: [] as Array<{
              class_id: string;
              teacher_id: string;
              membership_role: string;
            }>,
          }),
      classIds.length
        ? supabase
            .from("assignments")
            .select("id, title, due_at, class_id")
            .in("class_id", classIds)
            .eq("status", "published")
            .order("due_at", { ascending: true })
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              title: string;
              due_at: string | null;
              class_id: string;
            }>,
          }),
    ]);

  const teacherIds = Array.from(
    new Set([
      ...(classes ?? []).map((c) => c.teacher_id),
      ...(classTeachers ?? []).map((ct) => ct.teacher_id),
    ]),
  );
  const { data: allTeachers } = teacherIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", teacherIds)
    : { data: [] as Array<{ id: string; display_name: string }> };

  const teacherName = new Map(
    (allTeachers ?? []).map((t) => [t.id, t.display_name]),
  );
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s]));

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status, submitted_at, returned_at")
        .eq("student_id", profile.id)
        .in("assignment_id", assignmentIds)
    : {
        data: [] as Array<{
          id: string;
          assignment_id: string;
          status: string;
          submitted_at: string | null;
          returned_at: string | null;
        }>,
      };

  const submissionByAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );

  const releasedIds = (submissions ?? [])
    .filter((s) => s.status === "returned" || s.status === "marked")
    .map((s) => s.id);

  const { data: feedbackRows } = releasedIds.length
    ? await supabase
        .from("feedback")
        .select("submission_id, mark, status, released_at")
        .in("submission_id", releasedIds)
        .eq("status", "released")
    : {
        data: [] as Array<{
          submission_id: string;
          mark: number | null;
          status: string;
          released_at: string | null;
        }>,
      };

  const feedbackBySubmission = new Map(
    (feedbackRows ?? []).map((f) => [f.submission_id, f]),
  );

  const classCards = (classes ?? []).map((c) => {
    const subject = c.subject_id ? subjectById.get(c.subject_id) : undefined;
    const lead =
      (classTeachers ?? []).find(
        (ct) => ct.class_id === c.id && ct.membership_role === "lead_teacher",
      )?.teacher_id || c.teacher_id;
    const extras = (classTeachers ?? [])
      .filter(
        (ct) =>
          ct.class_id === c.id &&
          ct.teacher_id !== lead &&
          ct.membership_role !== "lead_teacher",
      )
      .map((ct) => teacherName.get(ct.teacher_id) || "Teacher");

    const classAssignments = (assignments ?? []).filter(
      (a) => a.class_id === c.id,
    );
    let active = 0;
    let overdue = 0;
    let hasRecentFeedback = false;
    for (const a of classAssignments) {
      const sub = submissionByAssignment.get(a.id);
      // Submitted/late/marked count as complete. Returned stays active for rework.
      const done = Boolean(
        sub &&
          ["submitted", "late", "marked"].includes(sub.status),
      );
      if (!done) {
        active += 1;
        if (a.due_at && new Date(a.due_at).getTime() < nowMs) overdue += 1;
      }
      if (sub && feedbackBySubmission.has(sub.id)) hasRecentFeedback = true;
    }

    return {
      id: c.id,
      name: c.name,
      subject: c.subject,
      year_group: c.year_group,
      colour_hex: c.colour_hex,
      archived: c.archived,
      subjectIconType: subject?.icon_type,
      subjectIconValue:
        subject?.icon_value || subject?.icon_storage_path || subject?.icon_key,
      subjectColour: subject?.colour || c.colour_hex,
      leadTeacher: teacherName.get(lead) || null,
      additionalTeachers: extras,
      activeHomeworkCount: active,
      overdueHomeworkCount: overdue,
      hasRecentFeedback,
      href: `/student/classes/${c.id}`,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.first_name}`}
        description={
          branding.schoolName
            ? `${branding.schoolName} — your classes, homework and feedback.`
            : "Your classes, homework and feedback."
        }
        action={
          <Link href="/student/classes">
            <Button variant="outline">Join a class</Button>
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          My classes
        </h2>
        {!classCards.length ? (
          <Card>
            <p className="text-sm text-slate-500">
              You are not enrolled in any classes yet.
            </p>
            <Link href="/student/classes" className="mt-3 inline-block">
              <Button size="sm">Join with a code</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {classCards.map((card) => (
              <ClassCard key={card.id} data={card} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">My classes</p>
          <p className="mt-2 text-3xl font-semibold">{classCards.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Assigned homework</p>
          <p className="mt-2 text-3xl font-semibold">
            {assignments?.length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Released feedback</p>
          <p className="mt-2 text-3xl font-semibold">
            {feedbackBySubmission.size}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Upcoming homework</h2>
          <Link href="/student/homework">
            <Button size="sm" variant="secondary">
              View all
            </Button>
          </Link>
        </div>
        {!assignments?.length ? (
          <p className="text-sm text-slate-500">No published homework yet.</p>
        ) : (
          <ul className="space-y-2">
            {(assignments ?? []).slice(0, 6).map((a) => {
              const submission = submissionByAssignment.get(a.id);
              const late =
                a.due_at &&
                new Date(a.due_at).getTime() < nowMs &&
                (!submission ||
                  ["draft", "returned"].includes(submission.status));
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
                    <Badge tone={late ? "danger" : "brand"}>
                      {submission?.status ?? "not submitted"}
                    </Badge>
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
