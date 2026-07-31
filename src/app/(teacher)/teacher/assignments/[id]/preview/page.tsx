import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { HomeworkBuilder } from "@/components/teacher/homework-builder/homework-builder";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateStructure } from "@/lib/homework/structure";
import type { Assignment } from "@/lib/types";

export default async function AssignmentPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*, classes(name)")
    .eq("id", id)
    .maybeSingle();

  if (!assignment) notFound();

  if (assignment.teacher_id !== profile.id) {
    const { data: ct } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    if (!ct) notFound();
  }

  if (!assignment.template_id) notFound();

  const initialSections = await loadTemplateStructure(
    supabase,
    assignment.template_id,
  );

  const className = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.name
    : assignment.classes?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Preview: ${assignment.title}`}
        description={`${className ?? "Assignment"} · student view`}
        action={
          <div className="flex gap-2">
            <Link href={`/teacher/assignments/${id}/builder`}>
              <Button variant="secondary">Edit builder</Button>
            </Link>
            <Link href={`/teacher/assignments/${id}`}>
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        }
      />

      <HomeworkBuilder
        assignment={assignment as Assignment & { template_id: string }}
        initialSections={initialSections}
        previewOnly
      />
    </div>
  );
}
