import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: assignment }, { data: classes }] = await Promise.all([
    supabase
      .from("assignments")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", profile.id)
      .maybeSingle(),
    supabase
      .from("classes")
      .select("id, name")
      .eq("teacher_id", profile.id)
      .eq("archived", false)
      .order("name"),
  ]);

  if (!assignment) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Edit assignment"
        action={
          <Link href={`/teacher/assignments/${id}`}>
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card>
        <AssignmentForm
          classes={classes ?? []}
          assignment={assignment as Assignment}
        />
      </Card>
    </div>
  );
}
