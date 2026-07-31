import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),#fafafa] px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
            LC
          </div>
          <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-slate-900">
            Sign in to LitCoach
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Use the email and password provided by your school administrator.
          </p>
        </div>
        <LoginForm errorFromQuery={params.error} />
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/" className="text-brand-700 hover:underline">
            Back to home
          </Link>
        </p>
      </Card>
    </div>
  );
}
