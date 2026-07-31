import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DASHBOARD_PATH, type UserRole } from "@/lib/types";

const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/update-password", "/auth/callback"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      if (!isPublicPath(pathname)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("error", "inactive");
        return NextResponse.redirect(redirectUrl);
      }
      return response;
    }

    const role = profile.role as UserRole;
    const dashboard = DASHBOARD_PATH[role];

    if (pathname === "/" || pathname === "/login") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = dashboard;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
    if (pathname.startsWith("/teacher") && role !== "teacher" && role !== "admin") {
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
    if (pathname.startsWith("/student") && role !== "student") {
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
  }

  return response;
}
