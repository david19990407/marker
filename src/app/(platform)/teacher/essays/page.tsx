"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { ESSAY_SUBMISSIONS } from "@/lib/data/dummy";
import type { EssaySubmission } from "@/lib/types";

export default function TeacherEssaysPage() {
  const [submissions, setSubmissions] = useState<EssaySubmission[]>(ESSAY_SUBMISSIONS);
  const [selectedId, setSelectedId] = useState(submissions[0]?.id);
  const selected = submissions.find((s) => s.id === selectedId);
  const [overrideMark, setOverrideMark] = useState(
    String(selected?.feedback?.estimatedMark ?? ""),
  );
  const [notes, setNotes] = useState("");

  function applyOverride() {
    if (!selected?.feedback) return;
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === selected.id
          ? {
              ...s,
              status: "teacher_reviewed",
              feedback: {
                ...s.feedback!,
                teacherOverrideMark: Number(overrideMark),
                teacherNotes: notes,
              },
            }
          : s,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Essay submissions"
        description="Review AI-marked essays and override marks when needed."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-3">
          {submissions.map((submission) => (
            <button
              key={submission.id}
              onClick={() => {
                setSelectedId(submission.id);
                setOverrideMark(String(submission.feedback?.estimatedMark ?? ""));
                setNotes(submission.feedback?.teacherNotes ?? "");
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${
                selectedId === submission.id
                  ? "border-brand-400 bg-brand-50"
                  : "border-slate-100"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{submission.studentName}</p>
                <Badge
                  tone={
                    submission.status === "teacher_reviewed"
                      ? "success"
                      : submission.status === "ai_marked"
                        ? "brand"
                        : "warning"
                  }
                >
                  {submission.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="line-clamp-2 text-xs text-slate-500">
                {submission.question}
              </p>
            </button>
          ))}
        </Card>

        {selected ? (
          <Card className="space-y-4">
            <div>
              <CardTitle>{selected.studentName}</CardTitle>
              <CardDescription className="mt-1">{selected.question}</CardDescription>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {selected.essayText}
            </div>
            {selected.feedback ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-500">AI mark</p>
                  <p className="text-2xl font-semibold text-brand-700">
                    {selected.feedback.estimatedMark}/{selected.feedback.outOf}
                  </p>
                  <p className="text-sm text-slate-500">
                    {selected.feedback.estimatedLevel}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-500">Teacher override</p>
                  <Input
                    type="number"
                    value={overrideMark}
                    onChange={(e) => setOverrideMark(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-700">Awaiting AI mark.</p>
            )}
            <Textarea
              placeholder="Teacher notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button onClick={applyOverride} disabled={!selected.feedback}>
              Save teacher review
            </Button>
            {selected.feedback?.teacherOverrideMark !== undefined ? (
              <p className="text-sm text-emerald-600">
                Override saved: {selected.feedback.teacherOverrideMark}/
                {selected.feedback.outOf}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
