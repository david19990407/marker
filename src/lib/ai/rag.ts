import { searchLessonChunks } from "@/lib/data/dummy";

export interface RetrievedChunk {
  lessonId: string;
  title: string;
  topic: string;
  content: string;
  score: number;
}

/**
 * Retrieval layer for LitCoach AI.
 * Currently uses an in-memory keyword index over dummy lessons.
 * Swap `searchLessonChunks` for a Supabase pgvector / embeddings query in production.
 */
export async function retrieveLessonContext(
  query: string,
  maxChunks = 4,
): Promise<RetrievedChunk[]> {
  return searchLessonChunks(query, maxChunks);
}

export function buildRagPrompt(query: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.title} — ${c.topic}]\n${c.content}`,
    )
    .join("\n\n");

  return {
    system: `You are LitCoach AI, a GCSE English learning coach for UK secondary students.

Rules:
- Only answer GCSE English questions (Literature, Language, revision, exam technique).
- Prefer the uploaded lesson context below. If context is thin, say so and coach from general GCSE knowledge carefully.
- Explain concepts clearly and ask short coaching questions.
- Suggest useful quotations and revision next steps.
- Never write a full homework answer or rewrite an entire essay.
- Keep a warm, professional, exam-focused tone.

Lesson context:
${context || "No lesson chunks retrieved."}`,
    user: query,
  };
}
