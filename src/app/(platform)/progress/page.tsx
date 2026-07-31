"use client";

import Link from "next/link";
import { ArrowRight, Award } from "lucide-react";
import { AoBars } from "@/components/charts/ao-bars";
import { ProgressChart } from "@/components/charts/progress-chart";
import { SkillRadar } from "@/components/charts/skill-radar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LESSONS, PROGRESS } from "@/lib/data/dummy";

export default function ProgressPage() {
  const nextLesson = LESSONS.find((l) => l.id === PROGRESS.suggestedNextLessonId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Progress"
        description="A clear view of your GCSE English journey — strengths, gaps, and what to do next."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Overall", value: `${PROGRESS.overallPercent}%` },
          {
            label: "Lessons completed",
            value: `${PROGRESS.lessonsCompleted}/${PROGRESS.lessonsTotal}`,
          },
          { label: "Quizzes completed", value: String(PROGRESS.quizzesCompleted) },
          { label: "Essays submitted", value: String(PROGRESS.essaysSubmitted) },
          { label: "Average marks", value: `${PROGRESS.averageGrade}/30` },
        ].map((stat) => (
          <Card key={stat.label} className="animate-fade-up">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">Progress graph</CardTitle>
          <CardDescription className="mb-4">Weekly learning score</CardDescription>
          <ProgressChart data={PROGRESS.weeklyProgress} />
        </Card>
        <Card>
          <CardTitle className="mb-2">Skill radar</CardTitle>
          <CardDescription className="mb-4">
            Relative strength across English skills
          </CardDescription>
          <SkillRadar data={PROGRESS.skillRadar} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardTitle className="mb-4">AO progress</CardTitle>
          <AoBars data={PROGRESS.aoProgress} />
        </Card>
        <Card>
          <CardTitle className="mb-4">Areas to improve</CardTitle>
          <ul className="space-y-3">
            {PROGRESS.areasToImprove.map((area) => (
              <li
                key={area}
                className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-900"
              >
                {area}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardTitle className="mb-4">Achievements</CardTitle>
          <div className="space-y-3">
            {PROGRESS.achievements.map((ach) => (
              <div
                key={ach.id}
                className="flex items-start gap-3 rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{ach.title}</p>
                  <p className="text-sm text-slate-500">{ach.description}</p>
                  <Badge tone="neutral" className="mt-2">
                    {new Date(ach.earnedAt).toLocaleDateString("en-GB")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-brand-100 bg-gradient-to-br from-white to-brand-50/60">
          <CardTitle>Suggested next lesson</CardTitle>
          <CardDescription className="mt-2">
            Chosen from your weakest linked topic and incomplete lessons.
          </CardDescription>
          {nextLesson ? (
            <>
              <h3 className="mt-5 text-xl font-semibold text-slate-900">
                {nextLesson.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {nextLesson.description}
              </p>
              <Link href={`/lessons/${nextLesson.id}`} className="mt-5 inline-block">
                <Button>
                  Continue learning <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
