import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AdminCommentBanksManager } from "@/components/admin/admin-comment-banks-manager";
import {
  listCommentBankItemsAction,
  listCommentBanksAction,
} from "@/lib/actions/comment-banks";
import { listCommentBankGroupsAction } from "@/lib/actions/comment-bank-groups";
import { requireProfile } from "@/lib/auth/get-profile";
import {
  getAllSubjectOptions,
  getAllYearGroupOptions,
} from "@/lib/school/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsCommentBanksPage() {
  await requireProfile(["admin"]);
  const [{ banks }, { items }, { groups }, subjects, yearGroups] =
    await Promise.all([
      listCommentBanksAction(),
      listCommentBankItemsAction({ includeArchived: true }),
      listCommentBankGroupsAction(),
      getAllSubjectOptions(),
      getAllYearGroupOptions(),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comment banks"
        description="Create school and department comment banks with grouped comments that teachers can link or copy into assignments."
        action={
          <Link href="/admin/settings">
            <Button variant="outline">Back to settings</Button>
          </Link>
        }
      />
      <AdminCommentBanksManager
        initialBanks={(banks ?? []).filter(
          (b) => b.scope === "school" || b.scope === "department",
        )}
        initialItems={items ?? []}
        initialGroups={groups ?? []}
        subjects={subjects.map((s) => s.name)}
        yearGroups={yearGroups.map((y) => y.name)}
      />
    </div>
  );
}
