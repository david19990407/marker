"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, PlayCircle, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LESSONS } from "@/lib/data/dummy";

export default function LessonDetailPage() {
  const params = useParams<{ id: string }>();
  const lesson = LESSONS.find((l) => l.id === params.id);

  if (!lesson) {
    return (
      <Card>
        <p className="text-slate-600">Lesson not found.</p>
        <Link href="/lessons" className="mt-4 inline-block">
          <Button variant="outline">Back to lessons</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/lessons"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to lessons
      </Link>

      <div className="animate-fade-up">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge>{lesson.examBoard}</Badge>
          <Badge tone="neutral">{lesson.yearGroup}</Badge>
          <Badge tone="neutral">{lesson.paper}</Badge>
          {lesson.completed ? <Badge tone="success">Completed</Badge> : null}
        </div>
        <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-semibold tracking-tight">
          {lesson.title}
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">{lesson.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardTitle className="mb-3">Lesson objectives</CardTitle>
            <ul className="space-y-2">
              {lesson.objectives.map((obj) => (
                <li
                  key={obj}
                  className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  {obj}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle className="mb-3">AI summary</CardTitle>
            <p className="text-sm leading-7 text-slate-600">{lesson.aiSummary}</p>
          </Card>
          <Card>
            <CardTitle className="mb-3">Homework</CardTitle>
            <p className="text-sm leading-7 text-slate-600">{lesson.homework}</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle className="mb-3">Your progress</CardTitle>
            <Progress value={lesson.progress} />
            <p className="mt-2 text-sm text-slate-500">
              {lesson.progress}% · ~{lesson.estimatedMinutes} minutes
            </p>
            <Button className="mt-4 w-full">
              {lesson.completed ? "Review lesson" : "Continue lesson"}
            </Button>
          </Card>
          <Card>
            <CardTitle className="mb-3">Materials</CardTitle>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3">
                <Presentation className="h-4 w-4 text-brand-600" />
                <span>{lesson.slidesUrl ? "Lesson slides" : "Slides coming soon"}</span>
              </div>
              {lesson.worksheets.map((w) => (
                <div
                  key={w}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3"
                >
                  <FileText className="h-4 w-4 text-brand-600" />
                  <span>{w}</span>
                </div>
              ))}
              {lesson.videos.map((v) => (
                <div
                  key={v}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3"
                >
                  <PlayCircle className="h-4 w-4 text-brand-600" />
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
