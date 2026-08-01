import { PageHeader } from "@/components/ui/page-header";
import { CommentBanksManager } from "@/components/teacher/comment-banks-manager";
import {
  listCommentBankItemsAction,
  listCommentBanksAction,
} from "@/lib/actions/comment-banks";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherCommentBanksPage() {
  await requireProfile(["teacher", "admin"]);
  const supabase = await createClient();

  const [{ banks }, { items }, { data: classes }] = await Promise.all([
    listCommentBanksAction(),
    listCommentBankItemsAction({ includeArchived: true }),
    supabase
      .from("classes")
      .select("id, name, subject")
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comment banks"
        description="School, department, personal, class and assignment comment libraries."
      />
      <CommentBanksManager
        initialBanks={banks ?? []}
        initialItems={items ?? []}
        classes={(classes ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          subject: c.subject ?? null,
        }))}
      />
    </div>
  );
}
