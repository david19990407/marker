"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { LESSONS } from "@/lib/data/dummy";

export default function EditLessonPage() {
  const params = useParams<{ id: string }>();
  const lesson = LESSONS.find((l) => l.id === params.id);
  const [saved, setSaved] = useState(false);

  if (!lesson) {
    return (
      <Card>
        <p>Lesson not found.</p>
        <Link href="/teacher/lessons" className="mt-4 inline-block">
          <Button variant="outline">Back</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Edit lesson"
        description={lesson.title}
        action={
          <Link href="/teacher/lessons">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
      <Card className="space-y-4">
        <CardTitle>Details</CardTitle>
        <Input defaultValue={lesson.title} />
        <Textarea defaultValue={lesson.description} />
        <Input defaultValue={lesson.topic} />
        <Textarea defaultValue={lesson.objectives.join("\n")} />
        <Textarea defaultValue={lesson.homework} />
        <Textarea defaultValue={lesson.aiSummary} />
        <Button onClick={() => setSaved(true)}>Save changes</Button>
        {saved ? (
          <p className="text-sm text-emerald-600">Changes saved in this demo session.</p>
        ) : null}
      </Card>
    </div>
  );
}
