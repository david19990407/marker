import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { HomeworkBuilder } from "@/components/teacher/homework-builder/homework-builder";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateStructure } from "@/lib/homework/structure";
import type { Assignment } from "@/lib/types";

export default async function HomeworkBuilderPage({
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

  // Access check: owner or co-teacher
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

  const initialSections = await loadTemplateStructure(supabase, assignment.template_id);

  const className = Array.isArray(assignment.classes)
    ? assignment.classes[0]?.name
    : assignment.classes?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Builder: ${assignment.title}`}
        description={className ?? "Assignment"}
        action={
          <Link href={`/teacher/assignments/${id}`}>
            <Button variant="outline">Back to assignment</Button>
          </Link>
        }
      />

      <HomeworkBuilder
        assignment={assignment as Assignment & { template_id: string }}
        initialSections={initialSections}
      />
    </div>
  );
}
