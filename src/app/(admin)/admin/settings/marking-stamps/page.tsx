import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkingStampsManager } from "@/components/admin/marking-stamps-manager";
import { listAllStampsAction } from "@/lib/actions/marking-stamps";
import { requireProfile } from "@/lib/auth/get-profile";
import { getAllSubjectOptions } from "@/lib/school/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsMarkingStampsPage() {
  await requireProfile(["admin"]);
  const [stampsResult, subjects] = await Promise.all([
    listAllStampsAction(),
    getAllSubjectOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking stamps"
        description="Upload and manage private marking stamps for the document marking workspace."
        action={
          <Link href="/admin/settings">
            <Button variant="outline">Back to settings</Button>
          </Link>
        }
      />
      <Card>
        <CardTitle className="mb-4">Stamp library</CardTitle>
        {stampsResult.error ? (
          <p className="text-sm text-rose-700">{stampsResult.error}</p>
        ) : (
          <MarkingStampsManager
            stamps={stampsResult.stamps ?? []}
            subjects={subjects.map((s) => s.name)}
          />
        )}
      </Card>
    </div>
  );
}
