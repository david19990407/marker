import { NextResponse } from "next/server";
import { generateCatchUpContent } from "@/lib/ai/openai";
import { CATCH_UP_PACKS, LESSONS } from "@/lib/data/dummy";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { lessonId?: string };
    const lesson = LESSONS.find((l) => l.id === body.lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const existing = CATCH_UP_PACKS[lesson.id];
    if (existing) {
      return NextResponse.json({ pack: existing, source: "demo" });
    }

    const generated = await generateCatchUpContent(lesson.title, lesson.topic);
    return NextResponse.json({
      pack: generated,
      source: generated ? "openai" : "unavailable",
    });
  } catch (error) {
    console.error("Catch-up API error", error);
    return NextResponse.json(
      { error: "Failed to generate catch-up pack" },
      { status: 500 },
    );
  }
}
