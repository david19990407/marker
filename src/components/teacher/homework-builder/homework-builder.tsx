"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionList } from "./section-list";
import { CopyFromModal } from "./copy-from-modal";
import { saveHomeworkStructureAction } from "@/lib/actions/homework-builder";
import { emptySection } from "@/lib/homework/structure";
import type { Assignment, BuilderSection } from "@/lib/types";

interface Props {
  assignment: Assignment & { template_id: string };
  initialSections: BuilderSection[];
}

export function HomeworkBuilder({ assignment, initialSections }: Props) {
  const [sections, setSections] = useState<BuilderSection[]>(initialSections);
  const [previewMode, setPreviewMode] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveHomeworkStructureAction(assignment.template_id, sections);
      setFlash(
        result.error
          ? { type: "error", msg: result.error }
          : { type: "success", msg: result.success ?? "Saved" },
      );
      setTimeout(() => setFlash(null), 4000);
    });
  }

  function addTopSection() {
    setSections((prev) => [...prev, emptySection()]);
  }

  function handleCopiedSection(section: BuilderSection) {
    setSections((prev) => [...prev, section]);
    setShowCopyModal(false);
  }

  return (
    <div className="space-y-4">
      {/* Published warning */}
      {assignment.status === "published" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This assignment is published. Changes here will affect what students see. Save carefully.
        </div>
      )}

      {/* Flash message */}
      {flash && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {flash.msg}
        </div>
      )}

      {/* Toolbar */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save structure"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPreviewMode((v) => !v)}
          >
            {previewMode ? "Back to edit" : "Preview as student"}
          </Button>
          <Button variant="outline" onClick={addTopSection}>
            + Add section
          </Button>
          <Button variant="outline" onClick={() => setShowCopyModal(true)}>
            Copy section from homework…
          </Button>
          {previewMode && (
            <Badge tone="neutral">Student view — teacher-only blocks hidden</Badge>
          )}
        </div>
      </Card>

      {/* Section list */}
      <SectionList
        sections={sections}
        onChange={setSections}
        previewMode={previewMode}
      />

      {sections.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            No sections yet. Click &ldquo;Add section&rdquo; to start building.
          </p>
        </Card>
      )}

      {/* Copy-from modal */}
      {showCopyModal && (
        <CopyFromModal
          targetTemplateId={assignment.template_id}
          onClose={() => setShowCopyModal(false)}
          onCopy={handleCopiedSection}
        />
      )}
    </div>
  );
}
