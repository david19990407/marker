"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { QUIZZES } from "@/lib/data/dummy";

export default function TeacherQuizzesPage() {
  const [created, setCreated] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision quizzes"
        description="Create topic quizzes linked to lessons for the Revision Hub and Catch Up flows."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <CardTitle>Create quiz</CardTitle>
          <Input placeholder="Quiz title" />
          <Input placeholder="Topic" />
          <Textarea placeholder="Question 1 prompt" />
          <Textarea placeholder="Options (one per line; mark correct with *)" />
          <Button onClick={() => setCreated(true)}>Create quiz</Button>
          {created ? (
            <p className="text-sm text-emerald-600">
              Quiz created in this demo session.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle className="mb-4">Existing quizzes</CardTitle>
          <div className="space-y-3">
            {QUIZZES.map((quiz) => (
              <div
                key={quiz.id}
                className="rounded-2xl border border-slate-100 px-4 py-3"
              >
                <p className="font-medium text-slate-900">{quiz.title}</p>
                <CardDescription className="mt-1">
                  {quiz.topic} · {quiz.questions.length} questions
                </CardDescription>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
