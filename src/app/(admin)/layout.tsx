import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/get-profile";
import { getBranding } from "@/lib/school/branding";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, branding] = await Promise.all([
    requireProfile(["admin"]),
    getBranding(),
  ]);
  return (
    <AppShell profile={profile} branding={branding}>
      {children}
    </AppShell>
  );
}
