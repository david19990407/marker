import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl, getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Handles invite / password-recovery redirects from Supabase Auth.
 * Exchanges the PKCE `code` for a session, persists cookies on the redirect
 * response, then sends the user to set their password.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const appUrl = getAppUrl();
  const successUrl = `${appUrl}/update-password`;
  const failureUrl = `${appUrl}/login?error=auth_callback_failed`;

  if (!code) {
    console.error("[auth/callback] Missing code query parameter");
    return NextResponse.redirect(failureUrl);
  }

  const { url, anonKey } = getSupabaseEnv();

  // Build the redirect first so setAll can attach session cookies to it.
  // Using cookies() alone can drop Set-Cookie headers on NextResponse.redirect.
  let response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.redirect(successUrl);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Log message/status only — never tokens, cookies, or secret keys.
    console.error(
      "[auth/callback] exchangeCodeForSession failed:",
      error.name,
      error.message,
      typeof error.status === "number" ? `status=${error.status}` : "",
    );
    return NextResponse.redirect(failureUrl);
  }

  return response;
}
