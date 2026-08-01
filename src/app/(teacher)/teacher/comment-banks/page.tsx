import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  listCommentBankItemsAction,
  listCommentBanksAction,
} from "@/lib/actions/comment-banks";
import { listCommentBankGroupsAction } from "@/lib/actions/comment-bank-groups";
import { requireProfile } from "@/lib/auth/get-profile";
import { COMMENT_BANK_SCOPE_LABELS } from "@/lib/feedback/types";

export const dynamic = "force-dynamic";

export default async function TeacherCommentBanksPage() {
  await requireProfile(["teacher", "admin"]);

  const [{ banks }, { items }, { groups }] = await Promise.all([
    listCommentBanksAction(),
    listCommentBankItemsAction({ includeArchived: true }),
    listCommentBankGroupsAction(),
  ]);

  const visibleBanks = (banks ?? []).filter(
    (bank) => bank.scope === "school" || bank.scope === "department",
  );
  const activeItems = (items ?? []).filter((item) => item.is_active);
  const activeGroups = (groups ?? []).filter((group) => group.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comment bank catalog"
        description="Browse administrator-managed school and department comment banks. Select comments from an assignment's Feedback tab."
      />
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Browse-only for teachers</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Comment banks are created, grouped and maintained by administrators.
            Open an assignment and use the Feedback tab to choose which comments
            are available while marking.
          </p>
        </div>
        <Link href="/teacher/assignments">
          <Button variant="secondary">Go to assignments</Button>
        </Link>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleBanks.map((bank) => {
          const bankGroups = activeGroups.filter(
            (group) => group.bank_id === bank.id,
          );
          const bankItems = activeItems.filter((item) => item.bank_id === bank.id);
          return (
            <Card key={bank.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{bank.name}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    {bank.description || "No description provided."}
                  </p>
                </div>
                <Badge tone="neutral">{COMMENT_BANK_SCOPE_LABELS[bank.scope]}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Subject
                  </dt>
                  <dd className="text-slate-700">{bank.subject || "Any"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Year group
                  </dt>
                  <dd className="text-slate-700">{bank.year_group || "Any"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Groups
                  </dt>
                  <dd className="text-slate-700">{bankGroups.length}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Comments
                  </dt>
                  <dd className="text-slate-700">{bankItems.length}</dd>
                </div>
              </dl>
              {bankGroups.length ? (
                <div className="flex flex-wrap gap-1">
                  {bankGroups.slice(0, 6).map((group) => (
                    <Badge key={group.id} tone="brand">
                      {group.name}
                    </Badge>
                  ))}
                  {bankGroups.length > 6 ? (
                    <Badge tone="neutral">+{bankGroups.length - 6} more</Badge>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {!visibleBanks.length ? (
        <Card className="text-sm text-slate-500">
          No administrator-managed comment banks are available yet.
        </Card>
      ) : null}
    </div>
  );
}
