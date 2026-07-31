import { NextResponse } from "next/server";
import { generateEssayFeedback } from "@/lib/ai/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      essayText?: string;
    };

    if (!body.question?.trim() || !body.essayText?.trim()) {
      return NextResponse.json(
        { error: "Question and essay text are required" },
        { status: 400 },
      );
    }

    const feedback = await generateEssayFeedback(
      body.question.trim(),
      body.essayText.trim(),
    );

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Essay API error", error);
    return NextResponse.json(
      { error: "Failed to mark essay" },
      { status: 500 },
    );
  }
}
