"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";

export default function NewLessonPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create lesson"
        description="Add a new GCSE English lesson with materials and an AI summary."
        action={
          <Link href="/teacher/lessons">
            <Button variant="outline">Cancel</Button>
          </Link>
        }
      />

      <Card className="space-y-4">
        <CardTitle>Lesson details</CardTitle>
        <Input placeholder="Title" />
        <Textarea placeholder="Description" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Topic (e.g. Macbeth)" />
          <select className="h-11 rounded-2xl border border-slate-200 px-3 text-sm">
            <option>AQA</option>
            <option>Edexcel</option>
            <option>OCR</option>
            <option>Eduqas</option>
          </select>
          <select className="h-11 rounded-2xl border border-slate-200 px-3 text-sm">
            <option>Year 10</option>
            <option>Year 11</option>
          </select>
          <select className="h-11 rounded-2xl border border-slate-200 px-3 text-sm">
            <option>Literature Paper 1</option>
            <option>Literature Paper 2</option>
            <option>Language Paper 1</option>
            <option>Language Paper 2</option>
          </select>
        </div>
        <Textarea placeholder="Lesson objectives (one per line)" />
        <Textarea placeholder="Homework" />
        <Textarea placeholder="AI summary (or leave blank to generate later)" />

        <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800">Upload materials</p>
          <p className="text-sm text-slate-500">
            PDFs, PowerPoints, Word documents and videos are supported in the MVP UI.
            Wire these inputs to Supabase Storage when credentials are available.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,video/*" />
            <Input type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,video/*" />
          </div>
        </div>

        <Button
          onClick={() => {
            setSaved(true);
          }}
        >
          Save lesson
        </Button>
        {saved ? (
          <p className="text-sm text-emerald-600">
            Lesson saved locally for this demo session. Connect Supabase to persist.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
