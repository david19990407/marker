import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/get-profile";
import { getBranding } from "@/lib/school/branding";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, branding] = await Promise.all([
    requireProfile(["teacher", "admin"]),
    getBranding(),
  ]);
  return (
    <AppShell
      profile={profile}
      platformDisplayName={branding.platformDisplayName}
      schoolName={branding.schoolName}
    >
      {children}
    </AppShell>
  );
}
