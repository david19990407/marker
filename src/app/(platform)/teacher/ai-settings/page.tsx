"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { AI_SETTINGS } from "@/lib/data/dummy";

export default function AiSettingsPage() {
  const [settings, setSettings] = useState(AI_SETTINGS);
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="AI settings"
        description="Configure how LitCoach AI coaches students and retrieves lesson context."
      />

      <Card className="space-y-4">
        <div>
          <CardTitle>Model & retrieval</CardTitle>
          <CardDescription className="mt-1">
            Changes apply to coach chat, essay marking and catch-up generation.
          </CardDescription>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Model</span>
          <Input
            value={settings.model}
            onChange={(e) =>
              setSettings((s) => ({ ...s, model: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">
            Temperature ({settings.temperature})
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.temperature}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                temperature: Number(e.target.value),
              }))
            }
            className="w-full accent-brand-600"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Max context chunks</span>
          <Input
            type="number"
            value={settings.maxContextChunks}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                maxContextChunks: Number(e.target.value),
              }))
            }
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Coaching style</span>
          <select
            className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm"
            value={settings.coachingStyle}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                coachingStyle: e.target.value as typeof s.coachingStyle,
              }))
            }
          >
            <option value="socratic">Socratic</option>
            <option value="supportive">Supportive</option>
            <option value="exam_focused">Exam focused</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">System prompt</span>
          <Textarea
            className="min-h-40"
            value={settings.systemPrompt}
            onChange={(e) =>
              setSettings((s) => ({ ...s, systemPrompt: e.target.value }))
            }
          />
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={settings.allowHomeworkCompletion}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                allowHomeworkCompletion: e.target.checked,
              }))
            }
            className="accent-brand-600"
          />
          Allow AI to complete homework (recommended: off)
        </label>
        <Button
          onClick={() => {
            setSaved(true);
          }}
        >
          Save AI settings
        </Button>
        {saved ? (
          <p className="text-sm text-emerald-600">
            Settings saved for this demo session.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
