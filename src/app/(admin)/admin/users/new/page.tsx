import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import { getActiveYearGroups } from "@/lib/school/settings";

export default async function NewUserPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const [{ data: classes }, yearGroups] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name")
      .eq("archived", false)
      .order("name"),
    getActiveYearGroups(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Create user"
        description="Invite a teacher, student or admin by email."
        action={
          <Link href="/admin/users">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card>
        <CreateUserForm classes={classes ?? []} yearGroups={yearGroups} />
      </Card>
    </div>
  );
}
