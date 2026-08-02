import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  bucket: z.enum([
    "assignment-resources",
    "student-submissions",
    "marking-stamps",
  ]),
  path: z.string().min(1),
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

    // One-hour signed URLs; clients refresh before expiry (see StampImage cache).
    const expiresIn = 60 * 60;
    const { data, error } = await supabase.storage
      .from(parsed.data.bucket)
      .createSignedUrl(parsed.data.path, expiresIn);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create download link" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      url: data.signedUrl,
      expiresIn,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
