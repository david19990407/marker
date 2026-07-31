import { NextResponse } from "next/server";
import { generateCoachReply } from "@/lib/ai/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await generateCoachReply(message);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Coach API error", error);
    return NextResponse.json(
      { error: "Failed to generate coach reply" },
      { status: 500 },
    );
  }
}
