import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeacherClassForm } from "@/components/teacher/class-form";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function NewTeacherClassPage() {
  await requireProfile(["teacher", "admin"]);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Create class"
        action={
          <Link href="/teacher/classes">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card>
        <TeacherClassForm />
      </Card>
    </div>
  );
}
