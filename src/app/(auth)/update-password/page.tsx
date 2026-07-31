import { Card } from "@/components/ui/card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { getBranding } from "@/lib/school/branding";
import { brandingStyleVars } from "@/lib/school/branding-shared";

export default async function UpdatePasswordPage() {
  const branding = await getBranding();
  const style = brandingStyleVars(branding) as React.CSSProperties;

  return (
    <div
      style={style}
      className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--brand-600)_14%,transparent),_transparent_40%),#fafafa] px-4"
    >
      <Card className="w-full max-w-md p-8">
        <h1 className="mb-2 font-[family-name:var(--font-outfit)] text-2xl font-semibold">
          Set a new password
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Choose a strong password for your {branding.platformDisplayName}{" "}
          account.
        </p>
        <UpdatePasswordForm />
      </Card>
    </div>
  );
}
