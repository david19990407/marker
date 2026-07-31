import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Service-role client — server-only. Never import this into client components.
 */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
