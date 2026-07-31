import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export default async function NewAssignmentPage() {
  const profile = await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  // Load all classes the teacher has create-assignments permission for
  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select("can_create_assignments, classes(id, name, archived)")
    .eq("teacher_id", profile.id)
    .eq("can_create_assignments", true);

  const classesFromCt = (ctRows ?? [])
    .flatMap((row) => {
      const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      return c && !c.archived ? [{ id: c.id, name: c.name }] : [];
    });

  // Fallback: legacy classes where teacher_id matches
  const { data: legacyClasses } = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", profile.id)
    .eq("archived", false);

  const classIdsSeen = new Set(classesFromCt.map((c) => c.id));
  const allClasses = [
    ...classesFromCt,
    ...(legacyClasses ?? []).filter((c) => !classIdsSeen.has(c.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Create assignment"
        action={
          <Link href="/teacher/assignments">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card>
        <AssignmentForm classes={allClasses} />
      </Card>
    </div>
  );
}
