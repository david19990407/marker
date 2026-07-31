import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, School } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.16),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.2),transparent_30%),linear-gradient(180deg,#fff,#fafafa)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
            LC
          </div>
          <div>
            <p className="font-[family-name:var(--font-outfit)] text-xl font-semibold tracking-tight">
              LitCoach
            </p>
            <p className="text-xs text-slate-500">Homework Platform</p>
          </div>
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16">
        <section>
          <p className="mb-4 text-sm font-medium text-brand-700">
            Assignments · Submissions · Marking · Feedback
          </p>
          <h1 className="font-[family-name:var(--font-outfit)] text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            LitCoach
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            A clear homework workflow for schools. Teachers set work, students
            submit, and feedback is released when ready — with roles managed by
            administrators.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg">
                Sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: School,
              title: "Classes",
              text: "Organised classes with join codes and memberships.",
            },
            {
              icon: BookOpen,
              title: "Assignments",
              text: "Publish homework with deadlines and resources.",
            },
            {
              icon: ClipboardList,
              title: "Submit work",
              text: "Students hand in written responses or files.",
            },
            {
              icon: BookOpen,
              title: "Teacher marking",
              text: "Manual marks, strengths, improvements and next steps.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-100 bg-white/80 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]"
            >
              <item.icon className="mb-3 h-5 w-5 text-brand-600" />
              <h2 className="font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
