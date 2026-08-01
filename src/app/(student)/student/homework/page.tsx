import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import {
  sortStudentAssignments,
  studentBucket,
} from "@/lib/homework/ordering";
import { currentTimeMs } from "@/lib/utils/time";

export default async function StudentHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { filter } = await searchParams;
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id")
    .eq("student_id", profile.id);
  const classIds = (memberships ?? []).map((m) => m.class_id);

  const { data: assignments } = classIds.length
    ? await supabase
        .from("assignments")
        .select(
          "id, title, due_at, release_at, updated_at, class_id, status, classes(name)",
        )
        .in("class_id", classIds)
        .eq("status", "published")
    : {
        data: [] as Array<{
          id: string;
          title: string;
          due_at: string | null;
          release_at: string | null;
          updated_at: string | null;
          class_id: string;
          status: string;
          classes: { name: string } | { name: string }[] | null;
        }>,
      };

  const ids = (assignments ?? []).map((a) => a.id);
  const { data: submissions } = ids.length
    ? await supabase
        .from("submissions")
        .select("assignment_id, status, returned_at, updated_at")
        .eq("student_id", profile.id)
        .in("assignment_id", ids)
    : {
        data: [] as {
          assignment_id: string;
          status: string;
          returned_at: string | null;
          updated_at: string | null;
        }[],
      };

  const byAssignment = new Map(
    (submissions ?? []).map((s) => [s.assignment_id, s]),
  );
  const nowMs = currentTimeMs();

  const enriched = (assignments ?? [])
    .filter((a) => !a.release_at || new Date(a.release_at).getTime() <= nowMs || filter === "scheduled")
    .map((a) => {
      const submission = byAssignment.get(a.id);
      return {
        ...a,
        submissionStatus: submission?.status ?? null,
        updated_at: submission?.updated_at ?? a.updated_at,
      };
    });

  let ordered = sortStudentAssignments(enriched, nowMs);
  if (filter) {
    ordered = ordered.filter((a) => studentBucket(a, nowMs) === filter);
  }

  const filters = [
    { id: "", label: "All" },
    { id: "overdue", label: "Overdue" },
    { id: "current", label: "Current" },
    { id: "scheduled", label: "Scheduled" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        description="Your assigned homework, ordered by urgency."
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.id || "all"}
            href={f.id ? `/student/homework?filter=${f.id}` : "/student/homework"}
          >
            <Badge tone={(!filter && !f.id) || filter === f.id ? "brand" : "neutral"}>
              {f.label}
            </Badge>
          </Link>
        ))}
      </div>

      {!ordered.length ? (
        <Card>
          <p className="text-sm text-slate-500">No homework in this list</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {ordered.map((a) => {
            const submission = byAssignment.get(a.id);
            const className = Array.isArray(a.classes)
              ? a.classes[0]?.name
              : a.classes?.name;
            const bucket = studentBucket(a, nowMs);
            const late = bucket === "overdue";
            return (
              <Card
                key={a.id}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone="neutral">{className ?? "Class"}</Badge>
                    <Badge tone={late ? "danger" : "brand"}>
                      {submission?.status ?? "not submitted"}
                    </Badge>
                    <Badge tone={late ? "warning" : "neutral"}>{bucket}</Badge>
                  </div>
                  <h2 className="font-semibold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">
                    Due{" "}
                    {a.due_at
                      ? new Date(a.due_at).toLocaleString("en-GB")
                      : "—"}
                    {a.release_at
                      ? ` · Released ${new Date(a.release_at).toLocaleString("en-GB")}`
                      : ""}
                  </p>
                </div>
                <Link href={`/student/homework/${a.id}`}>
                  <Button size="sm">Open</Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
