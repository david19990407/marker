import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_PATH, type Profile, type UserRole } from "@/lib/types";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireProfile(allowed?: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    redirect("/login");
  }
  if (allowed && !allowed.includes(profile.role)) {
    redirect(DASHBOARD_PATH[profile.role]);
  }
  return profile;
}
