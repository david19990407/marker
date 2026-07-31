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
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", profile.id)
    .eq("archived", false)
    .order("name");

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
        <AssignmentForm classes={classes ?? []} />
      </Card>
    </div>
  );
}
