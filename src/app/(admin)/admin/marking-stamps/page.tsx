import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { MarkingStampsManager } from "@/components/admin/marking-stamps-manager";
import { listAllStampsAction } from "@/lib/actions/marking-stamps";
import { requireProfile } from "@/lib/auth/get-profile";
import { getAllSubjectOptions } from "@/lib/school/settings";

export const dynamic = "force-dynamic";

export default async function AdminMarkingStampsPage() {
  await requireProfile(["admin"]);
  const [stampsResult, subjects] = await Promise.all([
    listAllStampsAction(),
    getAllSubjectOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking stamps"
        description="Upload school marking stamps for the document-style marking workspace. Stamp files stay in a private storage bucket."
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
