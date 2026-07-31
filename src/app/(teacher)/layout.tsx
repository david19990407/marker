import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["teacher", "admin"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
