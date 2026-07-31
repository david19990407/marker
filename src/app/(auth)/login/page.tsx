import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getBranding } from "@/lib/school/branding";
import {
  brandingStyleVars,
  schoolSubtitle,
} from "@/lib/school/branding-shared";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const branding = await getBranding();
  const subtitle = schoolSubtitle(
    branding.platformDisplayName,
    branding.schoolName,
  );
  const style = brandingStyleVars(branding) as React.CSSProperties;

  return (
    <div
      style={style}
      className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--brand-600)_14%,transparent),_transparent_40%),#fafafa] px-4"
    >
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
            {branding.initials}
          </div>
          <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-slate-900">
            Sign in to {branding.platformDisplayName}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm font-medium text-slate-600">{subtitle}</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-500">
            Use the email and password provided by your school administrator.
          </p>
        </div>
        <LoginForm errorFromQuery={params.error} />
        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are issued by your school administrator.
        </p>
      </Card>
    </div>
  );
}
