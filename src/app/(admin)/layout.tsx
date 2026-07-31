import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/get-profile";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["admin"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
