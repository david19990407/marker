"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  MessageSquareText,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.16),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.2),transparent_30%),linear-gradient(180deg,#fff,#fafafa)]" />
      <div className="pointer-events-none absolute -right-20 top-32 h-72 w-72 animate-float-soft rounded-full bg-brand-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-20 h-64 w-64 animate-pulse-soft rounded-full bg-brand-600/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-[family-name:var(--font-outfit)] text-xl font-semibold tracking-tight">
              LitCoach AI
            </p>
            <p className="text-xs text-slate-500">GCSE English, coached</p>
          </div>
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16">
        <section className="animate-fade-up">
          <p className="mb-4 text-sm font-medium text-brand-700">
            Built for GCSE English students & teachers
          </p>
          <h1 className="font-[family-name:var(--font-outfit)] text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            LitCoach AI
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Lessons, revision, essay coaching and catch-up — powered by AI that
            uses your classroom resources, not generic homework answers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button size="lg">
                Enter platform <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login?role=teacher">
              <Button size="lg" variant="secondary">
                Teacher portal
              </Button>
            </Link>
          </div>
        </section>

        <section className="animate-fade-up delay-200 grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: BookOpenCheck,
              title: "Lesson library",
              text: "Searchable GCSE lessons with progress and continue learning.",
            },
            {
              icon: ClipboardCheck,
              title: "Essay coaching",
              text: "AO-level feedback that improves writing — never rewrites it.",
            },
            {
              icon: MessageSquareText,
              title: "AI Coach",
              text: "ChatGPT-style help grounded in uploaded lessons.",
            },
            {
              icon: Trophy,
              title: "Progress clarity",
              text: "AO bars, skill radar, and next-step recommendations.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-100 bg-white/80 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur"
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
