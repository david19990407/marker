import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditUserForm } from "@/components/admin/edit-user-form";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/get-profile";
import type { Profile } from "@/lib/types";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireProfile(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: user },
    { data: classes },
    { data: memberships },
    { data: seededAdmin },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("classes")
      .select("id, name")
      .eq("archived", false)
      .order("name"),
    supabase.from("class_members").select("class_id").eq("student_id", id),
    supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!user) notFound();

  const isSelf = actor.id === user.id;
  const canEditRole = !isSelf || seededAdmin?.id === actor.id;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Edit user"
        description={user.email}
        action={
          <Link href="/admin/users">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card>
        <EditUserForm
          user={user as Profile}
          classes={classes ?? []}
          memberClassIds={(memberships ?? []).map((m) => m.class_id)}
          canEditRole={canEditRole}
        />
      </Card>
    </div>
  );
}
