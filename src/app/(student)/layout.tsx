import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["student"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
