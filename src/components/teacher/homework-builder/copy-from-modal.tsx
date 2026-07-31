"use client";

import { useState, useTransition } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listMyTemplatesAction,
  listTemplateSectionsAction,
  copySectionFromTemplateAction,
} from "@/lib/actions/homework-builder";
import type { BuilderSection } from "@/lib/types";

interface Props {
  targetTemplateId: string;
  onClose: () => void;
  onCopy: (section: BuilderSection) => void;
}

export function CopyFromModal({ targetTemplateId, onClose, onCopy }: Props) {
  const [templates, setTemplates] = useState<Array<{ id: string; title: string }> | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; title: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadTemplates() {
    startTransition(async () => {
      const result = await listMyTemplatesAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setTemplates(result.templates ?? []);
    });
  }

  function loadSections(templateId: string) {
    setSelectedTemplate(templateId);
    startTransition(async () => {
      const result = await listTemplateSectionsAction(templateId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSections(result.sections ?? []);
    });
  }

  function copySection(sectionId: string) {
    if (!selectedTemplate) return;
    startTransition(async () => {
      const result = await copySectionFromTemplateAction(
        selectedTemplate,
        sectionId,
        targetTemplateId,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.section) {
        onCopy(result.section);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Copy section from another homework</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        {error && (
          <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        {!templates ? (
          <Button onClick={loadTemplates} disabled={pending}>
            {pending ? "Loading…" : "Load my homework templates"}
          </Button>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-500">No other homework templates found.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Select a homework:</p>
            {templates
              .filter((t) => t.id !== targetTemplateId)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => loadSections(t.id)}
                  className={`w-full rounded-2xl border px-4 py-2 text-left text-sm transition hover:bg-brand-50 ${
                    selectedTemplate === t.id
                      ? "border-brand-400 bg-brand-50"
                      : "border-slate-200"
                  }`}
                >
                  {t.title}
                </button>
              ))}
          </div>
        )}

        {sections !== null && (
          <div className="mt-4 space-y-2">
            {sections.length === 0 ? (
              <p className="text-sm text-slate-500">No sections in this homework.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">Choose a section to copy:</p>
                {sections.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700">{s.title}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => copySection(s.id)}
                      disabled={pending}
                    >
                      Copy
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
