import { PageHeader } from "@/components/ui/page-header";
import { CsvImportPanel } from "@/components/admin/csv-import-panel";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function ImportUsersPage() {
  await requireProfile(["admin"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import users"
        description="Upload a CSV, validate every row, then confirm to invite users securely via the server."
      />
      <CsvImportPanel />
    </div>
  );
}
