"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock3, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { LESSONS } from "@/lib/data/dummy";

export default function LessonsPage() {
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState("All");
  const [topic, setTopic] = useState("All");
  const [year, setYear] = useState("All");

  const topics = useMemo(
    () => ["All", ...Array.from(new Set(LESSONS.map((l) => l.topic)))],
    [],
  );
  const boards = useMemo(
    () => ["All", ...Array.from(new Set(LESSONS.map((l) => l.examBoard)))],
    [],
  );

  const filtered = LESSONS.filter((lesson) => {
    const matchesQuery =
      !query ||
      `${lesson.title} ${lesson.description} ${lesson.topic}`
        .toLowerCase()
        .includes(query.toLowerCase());
    return (
      matchesQuery &&
      (board === "All" || lesson.examBoard === board) &&
      (topic === "All" || lesson.topic === topic) &&
      (year === "All" || lesson.yearGroup === year)
    );
  });

  return (
    <div>
      <PageHeader
        title="My Lessons"
        description="Browse uploaded GCSE English lessons, track progress, and continue where you left off."
      />

      <Card className="mb-6">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search lessons..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {["All", "Year 10", "Year 11"].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((lesson) => (
          <Card
            key={lesson.id}
            className="flex flex-col animate-fade-up"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{lesson.examBoard}</Badge>
              <Badge tone="brand">{lesson.topic}</Badge>
              {lesson.completed ? <Badge tone="success">Completed</Badge> : null}
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{lesson.title}</h2>
            <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-500">
              {lesson.description}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              {lesson.estimatedMinutes} min · {lesson.yearGroup} · {lesson.paper}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span>{lesson.progress}%</span>
              </div>
              <Progress value={lesson.progress} />
            </div>
            <Link href={`/lessons/${lesson.id}`} className="mt-5">
              <Button className="w-full" variant={lesson.progress > 0 ? "primary" : "secondary"}>
                {lesson.completed ? "Review" : lesson.progress > 0 ? "Continue" : "Start"}
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
