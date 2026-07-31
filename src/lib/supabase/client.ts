import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser / server Supabase client factory.
 * Returns null when env vars are missing so the MVP can run on dummy data.
 */
export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
