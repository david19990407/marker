import { Card } from "@/components/ui/card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_40%),#fafafa] px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="mb-2 font-[family-name:var(--font-outfit)] text-2xl font-semibold">
          Set a new password
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Choose a strong password for your LitCoach account.
        </p>
        <UpdatePasswordForm />
      </Card>
    </div>
  );
}
