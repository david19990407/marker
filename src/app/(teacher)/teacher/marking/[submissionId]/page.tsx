import { redirect } from "next/navigation";

/** Preserve legacy links: /teacher/marking/:id → /teacher/marking/submissions/:id */
export default async function LegacyMarkingSubmissionRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { submissionId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/teacher/marking/submissions/${submissionId}${suffix}`);
}
