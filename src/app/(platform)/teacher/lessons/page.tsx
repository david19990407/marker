"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LESSONS } from "@/lib/data/dummy";
import type { Lesson } from "@/lib/types";

export default function TeacherLessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>(LESSONS);

  function removeLesson(id: string) {
    setLessons((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Lessons"
        description="Upload, create, edit and organise GCSE English lessons for your students."
        action={
          <Link href="/teacher/lessons/new">
            <Button>
              <Plus className="h-4 w-4" /> Create lesson
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4">
        {lessons.map((lesson) => (
          <Card key={lesson.id} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge>{lesson.examBoard}</Badge>
                <Badge tone="neutral">{lesson.yearGroup}</Badge>
                <Badge tone="brand">{lesson.topic}</Badge>
              </div>
              <CardTitle>{lesson.title}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">{lesson.description}</p>
              <p className="mt-2 text-xs text-slate-400">
                Updated {new Date(lesson.updatedAt).toLocaleDateString("en-GB")} ·{" "}
                {lesson.worksheets.length} worksheets · {lesson.videos.length} videos
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/teacher/lessons/${lesson.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeLesson(lesson.id)}
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
