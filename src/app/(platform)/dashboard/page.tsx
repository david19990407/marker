"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardCheck,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { AoBars } from "@/components/charts/ao-bars";
import { ProgressChart } from "@/components/charts/progress-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth/auth-context";
import {
  LESSONS,
  PROGRESS,
  RECENT_ACTIVITY,
  RESOURCES,
  UPCOMING_TASKS,
} from "@/lib/data/dummy";

export default function DashboardPage() {
  const { user } = useAuth();
  const continueLesson =
    LESSONS.find((l) => l.id === PROGRESS.suggestedNextLessonId) ?? LESSONS[1];

  if (user?.role === "teacher") {
    return <TeacherDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-semibold tracking-tight text-slate-900">
          Welcome back, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-2 text-slate-500">
          Keep building exam confidence — your next best step is waiting.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Lessons completed",
            value: `${PROGRESS.lessonsCompleted}/${PROGRESS.lessonsTotal}`,
          },
          { label: "Quizzes completed", value: String(PROGRESS.quizzesCompleted) },
          { label: "Essays marked", value: String(PROGRESS.essaysMarked) },
          {
            label: "Average grade",
            value: `${PROGRESS.averageGrade}/30`,
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            className="animate-fade-up"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="animate-fade-up delay-200">
          <CardHeader>
            <div>
              <CardTitle>Continue learning</CardTitle>
              <CardDescription>{continueLesson.title}</CardDescription>
            </div>
            <Badge>{continueLesson.progress}% complete</Badge>
          </CardHeader>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            {continueLesson.description}
          </p>
          <Progress value={continueLesson.progress} className="mb-5" />
          <Link href={`/lessons/${continueLesson.id}`}>
            <Button>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>

        <Card className="animate-fade-up delay-300">
          <CardTitle className="mb-4">Quick actions</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/revision", label: "Revise", icon: Brain },
              { href: "/essay", label: "Mark an Essay", icon: ClipboardCheck },
              { href: "/coach", label: "AI Coach", icon: MessageSquareText },
              { href: "/catch-up", label: "Catch Up", icon: Sparkles },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="flex h-full flex-col items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition hover:border-brand-200 hover:bg-brand-50/60">
                  <action.icon className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-medium text-slate-800">
                    {action.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">Recent activity</CardTitle>
          <ul className="space-y-3">
            {RECENT_ACTIVITY.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-500">{item.description}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle className="mb-4">Upcoming tasks</CardTitle>
          <ul className="space-y-3">
            {UPCOMING_TASKS.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">Due {task.dueDate}</p>
                </div>
                <Badge
                  tone={
                    task.priority === "high"
                      ? "danger"
                      : task.priority === "medium"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {task.priority}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardTitle className="mb-2">Progress graph</CardTitle>
          <CardDescription className="mb-4">
            Overall learning score over the last six weeks
          </CardDescription>
          <ProgressChart data={PROGRESS.weeklyProgress} />
        </Card>
        <Card>
          <CardTitle className="mb-2">Assessment objective progress</CardTitle>
          <CardDescription className="mb-4">
            Focus next on AO3 context links
          </CardDescription>
          <AoBars data={PROGRESS.aoProgress} />
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent resources</CardTitle>
          <Link href="/resources">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {RESOURCES.slice(0, 4).map((resource) => (
            <div
              key={resource.id}
              className="rounded-2xl border border-slate-100 p-4"
            >
              <Badge tone="neutral">{resource.category}</Badge>
              <p className="mt-3 text-sm font-medium text-slate-900">
                {resource.title}
              </p>
              <p className="mt-1 text-xs text-slate-500">{resource.fileType}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TeacherDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-semibold tracking-tight">
          Teacher dashboard
        </h1>
        <p className="mt-2 text-slate-500">
          Manage lessons, review essays, and track class progress.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active lessons", value: String(LESSONS.length) },
          { label: "Resources", value: String(RESOURCES.length) },
          { label: "Pending essays", value: "1" },
          { label: "Students", value: "24" },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/teacher/lessons", label: "Upload / manage lessons", icon: BookOpen },
          { href: "/teacher/essays", label: "Review essays", icon: ClipboardCheck },
          { href: "/teacher/analytics", label: "Student analytics", icon: Brain },
          { href: "/teacher/ai-settings", label: "Configure AI", icon: Sparkles },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full hover:border-brand-200">
              <item.icon className="mb-3 h-5 w-5 text-brand-600" />
              <p className="font-medium text-slate-900">{item.label}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
