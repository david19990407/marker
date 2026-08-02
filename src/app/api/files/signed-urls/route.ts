import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  bucket: z.enum([
    "assignment-resources",
    "student-submissions",
    "marking-stamps",
  ]),
  paths: z.array(z.string().min(1)).max(80),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const expiresIn = 60 * 60;
    const unique = [...new Set(parsed.data.paths)];
    const entries = await Promise.all(
      unique.map(async (path) => {
        const { data, error } = await supabase.storage
          .from(parsed.data.bucket)
          .createSignedUrl(path, expiresIn);
        if (error || !data?.signedUrl) return [path, null] as const;
        return [path, data.signedUrl] as const;
      }),
    );

    const urls: Record<string, string> = {};
    for (const [path, url] of entries) {
      if (url) urls[path] = url;
    }

    return NextResponse.json({
      urls,
      expiresIn,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
