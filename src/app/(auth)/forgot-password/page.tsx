import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getBranding } from "@/lib/school/branding";

export default async function ForgotPasswordPage() {
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),#fafafa] px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="mb-2 font-[family-name:var(--font-outfit)] text-2xl font-semibold">
          Reset password
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Enter your email and we will send a {branding.platformDisplayName}{" "}
          reset link if an account exists.
        </p>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
