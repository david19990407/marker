import { redirect } from "next/navigation";

/** Preserve legacy links. */
export default async function LegacyStudentAssignmentRedirect({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  // Avoid redirect loop for nested static segments — only UUIDs.
  if (assignmentId === "subjects" || assignmentId === "assignments") {
    redirect("/student/homework");
  }
  redirect(`/student/homework/assignments/${assignmentId}`);
}
