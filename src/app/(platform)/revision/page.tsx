"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  FileQuestion,
  Layers3,
  Lightbulb,
  Map,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  FLASHCARDS,
  PAST_PAPER_QUESTIONS,
  QUIZZES,
  WEAK_TOPICS,
} from "@/lib/data/dummy";

const topics = [
  "Macbeth",
  "An Inspector Calls",
  "Jekyll and Hyde",
  "Power and Conflict",
  "Language Analysis",
  "Creative Writing",
];
const texts = ["Macbeth", "An Inspector Calls", "Jekyll and Hyde", "Exposure"];
const skills = ["AO1", "AO2", "AO3", "AO4", "Comparison", "Structure"];

export default function RevisionPage() {
  const [examBoard, setExamBoard] = useState("AQA");
  const [topic, setTopic] = useState("Macbeth");
  const [text, setText] = useState("Macbeth");
  const [skill, setSkill] = useState("AO2");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quickMode, setQuickMode] = useState(false);

  const cards = useMemo(
    () =>
      FLASHCARDS.filter(
        (c) => c.topic === topic || c.topic === "Exam Skills" || topic === "All",
      ),
    [topic],
  );
  const activeCard = cards[cardIndex % Math.max(cards.length, 1)];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision Hub"
        description="Choose your focus, then revise with flashcards, organisers, quizzes and past paper practice."
        action={
          <Button
            variant={quickMode ? "primary" : "secondary"}
            onClick={() => setQuickMode((v) => !v)}
          >
            <Zap className="h-4 w-4" />
            Quick revision mode
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            {
              label: "Exam Board",
              value: examBoard,
              set: setExamBoard,
              options: ["AQA", "Edexcel", "OCR", "Eduqas"],
            },
            {
              label: "Topic",
              value: topic,
              set: setTopic,
              options: topics,
            },
            {
              label: "Text",
              value: text,
              set: setText,
              options: texts,
            },
            {
              label: "Skill",
              value: skill,
              set: setSkill,
              options: skills,
            },
          ].map((field) => (
            <label key={field.label} className="text-sm">
              <span className="mb-1.5 block text-slate-500">{field.label}</span>
              <select
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3"
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
              >
                {field.options.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card className="border-brand-100 bg-gradient-to-br from-brand-50 to-white">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <CardTitle>AI recommends these weak areas</CardTitle>
            <CardDescription className="mt-1">
              Based on your recent essays, quizzes and progress data.
            </CardDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              {WEAK_TOPICS.map((item) => (
                <Badge
                  key={item.topic}
                  tone={item.priority === "high" ? "danger" : "warning"}
                >
                  {item.topic} · {item.reason}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topics.map((t) => (
          <button key={t} onClick={() => setTopic(t)} className="text-left">
            <Card
              className={`h-full ${topic === t ? "border-brand-300 ring-2 ring-brand-100" : ""}`}
            >
              <BookOpen className="mb-3 h-5 w-5 text-brand-600" />
              <CardTitle>{t}</CardTitle>
              <CardDescription className="mt-2">
                Topic cards, quotations and practice for {examBoard}.
              </CardDescription>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardTitle className="mb-1">Flashcards</CardTitle>
          <CardDescription className="mb-4">
            Tap to flip · {cards.length} cards for {topic}
          </CardDescription>
          {activeCard ? (
            <button
              className="flex min-h-48 w-full items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 px-6 py-8 text-center transition hover:border-brand-200"
              onClick={() => setFlipped((f) => !f)}
            >
              <p className="text-base font-medium leading-7 text-slate-800">
                {flipped ? activeCard.back : activeCard.front}
              </p>
            </button>
          ) : (
            <p className="text-sm text-slate-500">No flashcards for this topic yet.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFlipped(false);
                setCardIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous
            </Button>
            <Button
              onClick={() => {
                setFlipped(false);
                setCardIndex((i) => i + 1);
              }}
            >
              Next card
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: "Mind maps",
              text: `Theme webs for ${text}`,
              icon: Map,
            },
            {
              title: "Knowledge organisers",
              text: "One-page quotation & context packs",
              icon: Layers3,
            },
            {
              title: "Practice quizzes",
              text: `${QUIZZES.length} quizzes ready`,
              icon: Brain,
            },
            {
              title: "Model answers",
              text: "Annotated Level 5–6 responses",
              icon: Lightbulb,
            },
          ].map((item) => (
            <Card key={item.title}>
              <item.icon className="mb-3 h-5 w-5 text-brand-600" />
              <CardTitle>{item.title}</CardTitle>
              <CardDescription className="mt-2">{item.text}</CardDescription>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-brand-600" />
          <CardTitle>Past paper questions</CardTitle>
        </div>
        <div className="space-y-3">
          {PAST_PAPER_QUESTIONS.filter(
            (q) =>
              q.examBoard === examBoard &&
              (q.topic === topic || q.topic === text),
          ).map((q) => (
            <div
              key={q.id}
              className="rounded-2xl border border-slate-100 px-4 py-4"
            >
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge tone="neutral">{q.year}</Badge>
                <Badge>{q.marks} marks</Badge>
                <Badge tone="brand">{q.paper}</Badge>
              </div>
              <p className="text-sm font-medium text-slate-900">{q.question}</p>
              {!quickMode ? (
                <p className="mt-2 text-sm text-slate-500">
                  Model answer: {q.modelAnswerSnippet}
                </p>
              ) : (
                <p className="mt-2 text-sm text-brand-700">
                  Quick mode: plan a thesis + two quotations before revealing a model.
                </p>
              )}
            </div>
          ))}
          {PAST_PAPER_QUESTIONS.filter(
            (q) =>
              q.examBoard === examBoard &&
              (q.topic === topic || q.topic === text),
          ).length === 0 ? (
            <p className="text-sm text-slate-500">
              No past paper matches for this combination — try another topic.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
