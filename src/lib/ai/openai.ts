import OpenAI from "openai";
import { AI_SETTINGS } from "@/lib/data/dummy";
import { buildRagPrompt, retrieveLessonContext } from "@/lib/ai/rag";
import type { EssayFeedback } from "@/lib/types";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const GCSE_GUARD =
  /\b(maths|math|biology|chemistry|physics|history|geography|french|spanish|coding|javascript|python)\b/i;

export function isGcseEnglishQuery(query: string) {
  if (GCSE_GUARD.test(query) && !/\b(english|shakespeare|poem|essay|quotation|ao[1-4]|macbeth|priestley)\b/i.test(query)) {
    return false;
  }
  return true;
}

/** Coach reply with RAG. Falls back to deterministic demo responses without an API key. */
export async function generateCoachReply(query: string) {
  if (!isGcseEnglishQuery(query)) {
    return {
      reply:
        "I’m LitCoach AI — I only help with GCSE English. Try asking about a text, quotation, exam question, or writing skill.",
      sources: [] as { title: string; topic: string }[],
    };
  }

  const chunks = await retrieveLessonContext(
    query,
    AI_SETTINGS.maxContextChunks,
  );
  const { system, user } = buildRagPrompt(query, chunks);
  const client = getClient();

  if (!client) {
    return {
      reply: demoCoachReply(query, chunks[0]?.title),
      sources: chunks.map((c) => ({ title: c.title, topic: c.topic })),
    };
  }

  const completion = await client.chat.completions.create({
    model: AI_SETTINGS.model,
    temperature: AI_SETTINGS.temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return {
    reply:
      completion.choices[0]?.message?.content ??
      "I couldn’t generate a reply just now. Please try again.",
    sources: chunks.map((c) => ({ title: c.title, topic: c.topic })),
  };
}

function demoCoachReply(query: string, sourceTitle?: string) {
  const q = query.toLowerCase();
  if (q.includes("ambition") || q.includes("macbeth")) {
    return `Great focus. In Macbeth, ambition is often shown as unstable — think of “vaulting ambition”, which suggests a leap that overshoots and falls.

Coaching question: In your paragraph, are you explaining *how* the metaphor of horsemanship makes ambition seem dangerous, or only stating that Macbeth is ambitious?

Useful next step: pair that quotation with one moment where guilt follows the ambitious act (blood/sleep imagery).${sourceTitle ? `\n\nBased primarily on: ${sourceTitle}.` : ""}`;
  }
  if (q.includes("inspector") || q.includes("responsibility")) {
    return `Priestley presents social responsibility as a moral duty, not a choice. The Inspector speaks for a collective conscience — “We are members of one body”.

Before you write more: which character best shows someone refusing responsibility, and which shows learning? Contrast is often your highest-value structure.${sourceTitle ? `\n\nBased primarily on: ${sourceTitle}.` : ""}`;
  }
  if (q.includes("homework") || q.includes("write my") || q.includes("do this for me")) {
    return `I won’t complete the homework for you — that won’t help in the exam. I *will* help you plan it.

Tell me: 1) the question, 2) the text, 3) what you already think. Then we’ll build a thesis and two strong quotation choices together.`;
  }
  return `Let’s unpack that GCSE English question together.

1) What is the writer trying to show?
2) Which method (word, image, structure) proves it?
3) What is the effect on the audience/reader?

Share a quotation or exam question and I’ll coach the next step — without writing the whole answer for you.${sourceTitle ? `\n\nClosest lesson context: ${sourceTitle}.` : ""}`;
}

/** Essay marking with coaching feedback. Never rewrites the whole essay. */
export async function generateEssayFeedback(
  question: string,
  essayText: string,
): Promise<EssayFeedback> {
  const chunks = await retrieveLessonContext(`${question} ${essayText}`, 4);
  const client = getClient();

  if (!client) {
    return demoEssayFeedback(essayText);
  }

  const completion = await client.chat.completions.create({
    model: AI_SETTINGS.model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a GCSE English examiner-coach. Return JSON with keys:
estimatedMark (number), outOf (30), estimatedLevel (string), ao1, ao2, ao3, ao4 (numbers out of ~8/8/8/4 as relevant),
strengths, weaknesses, improvements, nextSteps (string arrays).
Do NOT rewrite the essay. Coach specific improvements. Use lesson context when relevant.
Context:\n${chunks.map((c) => c.content).join("\n")}`,
      },
      {
        role: "user",
        content: `Question: ${question}\n\nEssay:\n${essayText}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as EssayFeedback;
    return {
      estimatedMark: parsed.estimatedMark ?? 18,
      outOf: parsed.outOf ?? 30,
      estimatedLevel: parsed.estimatedLevel ?? "Level 4",
      ao1: parsed.ao1 ?? 5,
      ao2: parsed.ao2 ?? 5,
      ao3: parsed.ao3 ?? 4,
      ao4: parsed.ao4 ?? 3,
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      improvements: parsed.improvements ?? [],
      nextSteps: parsed.nextSteps ?? [],
    };
  } catch {
    return demoEssayFeedback(essayText);
  }
}

function demoEssayFeedback(essayText: string): EssayFeedback {
  const words = essayText.trim().split(/\s+/).length;
  const base = words > 180 ? 21 : words > 100 ? 17 : 13;
  return {
    estimatedMark: base,
    outOf: 30,
    estimatedLevel: base >= 21 ? "Level 5" : base >= 16 ? "Level 4" : "Level 3",
    ao1: Math.min(8, Math.round(base / 3.5)),
    ao2: Math.min(8, Math.round(base / 4)),
    ao3: Math.min(8, Math.round(base / 4.5)),
    ao4: 3,
    strengths: [
      "You stay mostly focused on the question",
      "There is a clear central idea emerging",
      words > 120
        ? "You include some textual reference"
        : "You attempt to engage with the text",
    ],
    weaknesses: [
      "Method analysis (AO2) needs more precision — zoom in on individual words",
      "Context (AO3) is thin or missing",
      "Developments between paragraphs could be sharper",
    ],
    improvements: [
      "After each quotation, explain *how* a method creates meaning",
      "Add one precise contextual link that illuminates the writer’s purpose",
      "Use a topic sentence that answers the question directly",
    ],
    nextSteps: [
      "Improve one existing paragraph — do not rewrite the whole essay",
      "Add a stronger analytical verb bank (implies / intensifies / undermines)",
      "Resubmit for a second coaching mark",
    ],
  };
}

export async function generateCatchUpContent(lessonTitle: string, topic: string) {
  const client = getClient();
  if (!client) {
    return null;
  }
  const chunks = await retrieveLessonContext(`${lessonTitle} ${topic}`, 3);
  const completion = await client.chat.completions.create({
    model: AI_SETTINGS.model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "Create a concise GCSE English catch-up pack as JSON with summary, keyKnowledge[], activities[], practiceQuestion, homework.",
      },
      {
        role: "user",
        content: `Lesson: ${lessonTitle}\nTopic: ${topic}\nContext:\n${chunks.map((c) => c.content).join("\n")}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content ?? null;
}
