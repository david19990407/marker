"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { CATCH_UP_PACKS, LESSONS } from "@/lib/data/dummy";

export default function CatchUpPage() {
  const missedLessons = LESSONS.filter((l) => !l.completed && l.progress < 40);
  const [selectedId, setSelectedId] = useState(missedLessons[0]?.id ?? "lesson-4");
  const pack = CATCH_UP_PACKS[selectedId];
  const lesson = LESSONS.find((l) => l.id === selectedId);
  const [checklist, setChecklist] = useState(pack?.checklist ?? []);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});

  const completion = useMemo(() => {
    if (!checklist.length) return 0;
    return Math.round(
      (checklist.filter((c) => c.done).length / checklist.length) * 100,
    );
  }, [checklist]);

  function selectLesson(id: string) {
    setSelectedId(id);
    setChecklist(CATCH_UP_PACKS[id]?.checklist ?? []);
    setQuizAnswers({});
  }

  function toggleCheck(id: string) {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catch Up"
        description="Choose a missed lesson and generate a focused recovery pack: summary, activities, quiz and homework."
      />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardTitle className="mb-4">Missed lessons</CardTitle>
          <div className="space-y-3">
            {missedLessons.map((item) => (
              <button
                key={item.id}
                onClick={() => selectLesson(item.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedId === item.id
                    ? "border-brand-400 bg-brand-50"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.topic} · {item.progress}% complete
                </p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <CardTitle>{lesson?.title ?? "Catch-up pack"}</CardTitle>
              <CardDescription className="mt-1">
                AI-generated recovery pathway
              </CardDescription>
            </div>
            <Badge>{completion}% complete</Badge>
          </div>
          <Progress value={completion} className="mb-5" />

          {pack ? (
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Lesson summary
                </h3>
                <p className="text-sm leading-7 text-slate-600">{pack.summary}</p>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Key knowledge
                </h3>
                <ul className="space-y-2">
                  {pack.keyKnowledge.map((item) => (
                    <li
                      key={item}
                      className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Activities
                </h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
                  {pack.activities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Quiz</h3>
                <div className="space-y-4">
                  {pack.quiz.map((q) => (
                    <div key={q.id} className="rounded-2xl border border-slate-100 p-4">
                      <p className="text-sm font-medium text-slate-800">{q.prompt}</p>
                      <div className="mt-3 grid gap-2">
                        {q.options.map((opt, idx) => {
                          const selected = quizAnswers[q.id] === idx;
                          const revealed = quizAnswers[q.id] !== undefined;
                          const correct = idx === q.correctIndex;
                          return (
                            <button
                              key={opt}
                              onClick={() =>
                                setQuizAnswers((prev) => ({ ...prev, [q.id]: idx }))
                              }
                              className={`rounded-xl border px-3 py-2 text-left text-sm ${
                                selected
                                  ? correct
                                    ? "border-emerald-300 bg-emerald-50"
                                    : "border-rose-300 bg-rose-50"
                                  : revealed && correct
                                    ? "border-emerald-200 bg-emerald-50/50"
                                    : "border-slate-100 hover:border-slate-200"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {quizAnswers[q.id] !== undefined ? (
                        <p className="mt-2 text-xs text-slate-500">{q.explanation}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold">Practice question</h3>
                  <p className="text-sm text-slate-600">{pack.practiceQuestion}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold">Homework</h3>
                  <p className="text-sm text-slate-600">{pack.homework}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Checklist
                </h3>
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleCheck(item.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3 text-left text-sm"
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-300" />
                      )}
                      <span
                        className={
                          item.done ? "text-slate-400 line-through" : "text-slate-700"
                        }
                      >
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-600">
                No pre-built pack for this lesson yet. In production, the catch-up
                API generates one from lesson embeddings.
              </p>
              <Button className="mt-4" variant="secondary">
                Generate with AI
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
