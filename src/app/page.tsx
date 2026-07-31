import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { DASHBOARD_PATH } from "@/lib/types";

/**
 * Root route: no marketing home page.
 * Logged-out users → /login; logged-in users → role dashboard.
 */
export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    redirect("/login");
  }
  redirect(DASHBOARD_PATH[profile.role]);
}
