import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function StudentClassesPage() {
  await requireProfile(["student"]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Join a class"
        description="Enter the join code from your teacher to enrol."
        action={
          <Link href="/student/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        }
      />

      <Card>
        <CardTitle className="mb-4">Class join code</CardTitle>
        <JoinClassForm />
      </Card>
    </div>
  );
}
