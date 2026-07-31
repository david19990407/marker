"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ESSAY_SUBMISSIONS, EXAM_QUESTIONS } from "@/lib/data/dummy";
import type { EssayFeedback } from "@/lib/types";

export default function EssayPage() {
  const [question, setQuestion] = useState(EXAM_QUESTIONS[0]);
  const [essay, setEssay] = useState(ESSAY_SUBMISSIONS[0].essayText);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<EssayFeedback | null>(
    ESSAY_SUBMISSIONS[0].feedback ?? null,
  );
  const [version, setVersion] = useState(1);

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, essayText: essay }),
      });
      const data = (await res.json()) as { feedback: EssayFeedback };
      setFeedback(data.feedback);
      setVersion((v) => v + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Essay Marking"
        description="Paste or upload an essay. LitCoach AI marks by assessment objectives and coaches improvements — it never rewrites the whole piece."
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardTitle className="mb-4">Submit your response</CardTitle>
          <label className="mb-4 block text-sm">
            <span className="mb-1.5 block text-slate-500">Exam question</span>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            >
              {EXAM_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-4 block text-sm">
            <span className="mb-1.5 block text-slate-500">Your essay</span>
            <Textarea
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              placeholder="Paste your essay here..."
              className="min-h-72"
            />
          </label>

          <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 hover:border-brand-300 hover:bg-brand-50/40">
            <Upload className="h-4 w-4 text-brand-600" />
            <span>
              {fileName
                ? `Attached: ${fileName}`
                : "Upload a Word document or PDF (demo stores the filename only)"}
            </span>
            <input
              type="file"
              accept=".doc,.docx,.pdf"
              className="hidden"
              onChange={(e) =>
                setFileName(e.target.files?.[0]?.name ?? null)
              }
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSubmit} disabled={loading || !essay.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analysing…
                </>
              ) : (
                "Submit for AI marking"
              )}
            </Button>
            <Badge tone="neutral">Version {version}</Badge>
          </div>
        </Card>

        <div className="space-y-6">
          {feedback ? (
            <>
              <Card className="animate-fade-up">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Estimated mark</CardTitle>
                    <CardDescription>Coaching feedback, not a final grade</CardDescription>
                  </div>
                  <Badge>{feedback.estimatedLevel}</Badge>
                </div>
                <p className="mt-4 text-4xl font-semibold text-brand-700">
                  {feedback.estimatedMark}
                  <span className="text-lg text-slate-400">/{feedback.outOf}</span>
                </p>
              </Card>

              <Card>
                <CardTitle className="mb-4">Assessment objectives</CardTitle>
                {[
                  ["AO1", feedback.ao1, 8],
                  ["AO2", feedback.ao2, 8],
                  ["AO3", feedback.ao3, 8],
                  ["AO4", feedback.ao4, 4],
                ].map(([label, score, max]) => (
                  <div key={String(label)} className="mb-3">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-slate-500">
                        {score}/{max}
                      </span>
                    </div>
                    <Progress value={(Number(score) / Number(max)) * 100} />
                  </div>
                ))}
              </Card>
            </>
          ) : (
            <Card>
              <CardTitle>Awaiting submission</CardTitle>
              <CardDescription className="mt-2">
                Feedback will appear here with strengths, weaknesses and next steps.
              </CardDescription>
            </Card>
          )}
        </div>
      </div>

      {feedback ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Strengths", items: feedback.strengths, tone: "success" as const },
            { title: "Weaknesses", items: feedback.weaknesses, tone: "warning" as const },
            {
              title: "Specific improvements",
              items: feedback.improvements,
              tone: "brand" as const,
            },
            { title: "Next steps", items: feedback.nextSteps, tone: "neutral" as const },
          ].map((section) => (
            <Card key={section.title}>
              <CardTitle className="mb-3">{section.title}</CardTitle>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardTitle className="mb-2">Improve & resubmit</CardTitle>
        <CardDescription>
          Edit one or two paragraphs above using the coaching points, then submit
          again. LitCoach AI will not rewrite the essay for you.
        </CardDescription>
      </Card>
    </div>
  );
}
