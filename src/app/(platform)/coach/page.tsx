"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { ChatMessage } from "@/lib/types";

const STARTERS = [
  "Explain vaulting ambition in Macbeth",
  "How do I improve AO3 in my Inspector Calls essay?",
  "Suggest quotations for duality in Jekyll and Hyde",
  "What should I revise if comparison is my weak area?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi — I’m LitCoach AI. Ask me about GCSE English texts, quotations, exam technique or revision. I’ll coach you using your uploaded lessons, and I won’t complete homework for you.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<{ title: string; topic: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      createdAt: now,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      const data = (await res.json()) as {
        reply: string;
        sources: { title: string; topic: string }[];
      };
      setSources(data.sources ?? []);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <PageHeader
        title="AI Coach"
        description="ChatGPT-style coaching for GCSE English, grounded in your lesson library."
        className="mb-4"
      />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">LitCoach AI</p>
            <p className="text-xs text-slate-500">GCSE English only · RAG enabled</p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-7 sm:max-w-[70%] ${
                  message.role === "user"
                    ? "bg-brand-600 text-white"
                    : "border border-slate-100 bg-slate-50 text-slate-700"
                }`}
              >
                <div className="prose-chat whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking with lesson context…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {sources.length > 0 ? (
          <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            Sources: {sources.map((s) => s.title).join(" · ")}
          </div>
        ) : null}

        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void sendMessage(starter)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
              >
                {starter}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a quotation, essay skill, or revision topic..."
              className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <Button type="submit" disabled={loading || !input.trim()} className="h-12 px-4">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
