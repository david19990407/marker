import { redirect } from "next/navigation";

/** Review step removed — submit happens on the main homework page. */
export default async function StudentHomeworkReviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  redirect(`/student/homework/assignments/${assignmentId}`);
}
