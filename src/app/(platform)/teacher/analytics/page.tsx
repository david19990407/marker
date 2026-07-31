"use client";

import { AoBars } from "@/components/charts/ao-bars";
import { ProgressChart } from "@/components/charts/progress-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { PROGRESS } from "@/lib/data/dummy";

const students = [
  { name: "Alex Morgan", lessons: 68, essays: 22, quizzes: 4, risk: "Medium" },
  { name: "Jordan Lee", lessons: 41, essays: 14, quizzes: 2, risk: "High" },
  { name: "Sam Patel", lessons: 82, essays: 25, quizzes: 6, risk: "Low" },
  { name: "Riley Chen", lessons: 55, essays: 18, quizzes: 3, risk: "Medium" },
];

export default function TeacherAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Student progress"
        description="Class-level analytics with room to scale beyond the initial cohort."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Students", value: "24" },
          { label: "Avg completion", value: "61%" },
          { label: "Essays this week", value: "18" },
          { label: "At-risk students", value: "3" },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">Class progress trend</CardTitle>
          <CardDescription className="mb-4">
            Aggregated weekly score (sample student series)
          </CardDescription>
          <ProgressChart data={PROGRESS.weeklyProgress} />
        </Card>
        <Card>
          <CardTitle className="mb-4">Average AO profile</CardTitle>
          <AoBars data={PROGRESS.aoProgress} />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-4">Students</CardTitle>
        <div className="space-y-3">
          {students.map((student) => (
            <div
              key={student.name}
              className="grid gap-3 rounded-2xl border border-slate-100 px-4 py-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center"
            >
              <div>
                <p className="font-medium text-slate-900">{student.name}</p>
                <p className="text-xs text-slate-500">
                  Essays avg {student.essays}/30 · {student.quizzes} quizzes
                </p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Lesson completion</span>
                  <span>{student.lessons}%</span>
                </div>
                <Progress value={student.lessons} />
              </div>
              <Badge
                tone={
                  student.risk === "High"
                    ? "danger"
                    : student.risk === "Medium"
                      ? "warning"
                      : "success"
                }
              >
                {student.risk} risk
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
