"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
  /** When true, show only student preview (used by /preview route) */
  previewOnly?: boolean;
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function HomeworkBuilder({
  assignment,
  initialSections,
  previewOnly = false,
}: Props) {
  const [sections, setSections] = useState<BuilderSection[]>(initialSections);
  const [previewMode, setPreviewMode] = useState(previewOnly);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [issuedAcknowledged, setIssuedAcknowledged] = useState(
    assignment.status !== "published",
  );
  const [pending, startTransition] = useTransition();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSections = useRef(sections);

  useEffect(() => {
    latestSections.current = sections;
  }, [sections]);

  const isIssued = assignment.status === "published";

  const persist = useCallback(
    (next: BuilderSection[]) => {
      startTransition(async () => {
        setSaveStatus("saving");
        const result = await saveHomeworkStructureAction(
          assignment.template_id,
          next,
        );
        if (result.error) {
          setSaveStatus("error");
          setFlash({ type: "error", msg: result.error });
        } else {
          if (result.sections) setSections(result.sections);
          setSaveStatus("saved");
          setFlash({ type: "success", msg: result.success ?? "Saved" });
          setTimeout(() => setFlash(null), 3000);
          setTimeout(() => {
            setSaveStatus((s) => (s === "saved" ? "idle" : s));
          }, 2500);
        }
      });
    },
    [assignment.template_id],
  );

  function markDirty(next: BuilderSection[]) {
    if (isIssued && !issuedAcknowledged) {
      const ok = window.confirm(
        "This homework has already been issued to students. Editing content may change what students see and can affect in-progress answers for deleted questions. Continue?",
      );
      if (!ok) return;
      setIssuedAcknowledged(true);
    }
    setSections(next);
    setSaveStatus("dirty");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persist(latestSections.current);
    }, 2000);
  }

  function handleSave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    persist(sections);
  }

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "dirty" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  function addTopSection() {
    markDirty([...sections, emptySection()]);
  }

  function handleCopiedSection(section: BuilderSection) {
    markDirty([...sections, section]);
    setShowCopyModal(false);
  }

  const statusLabel =
    saveStatus === "dirty"
      ? "Unsaved changes"
      : saveStatus === "saving"
        ? "Saving draft…"
        : saveStatus === "saved"
          ? "Draft saved"
          : saveStatus === "error"
            ? "Save failed"
            : "All changes saved";

  return (
    <div className="space-y-4">
      {isIssued && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This assignment is published. Changes will affect what students see.
          You will be asked to confirm before the first edit in this session.
        </div>
      )}

      {(saveStatus === "dirty" || saveStatus === "error") && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            saveStatus === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
          role="status"
        >
          {saveStatus === "dirty"
            ? "You have unsaved changes. Drafts autosave shortly, or click Save draft."
            : "Could not save. Check your connection and try again."}
        </div>
      )}

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

      {!previewOnly && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPreviewMode((v) => !v)}
            >
              {previewMode ? "Back to edit" : "Preview as student"}
            </Button>
            <Link href={`/teacher/assignments/${assignment.id}/preview`}>
              <Button variant="outline">Open preview page</Button>
            </Link>
            <Link href={`/teacher/assignments/${assignment.id}/edit`}>
              <Button variant="outline">Publish / schedule</Button>
            </Link>
            <Button variant="outline" onClick={addTopSection} disabled={previewMode}>
              + Add section
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCopyModal(true)}
              disabled={previewMode}
            >
              Copy section from homework…
            </Button>
            <Badge
              tone={
                saveStatus === "dirty" || saveStatus === "error"
                  ? "warning"
                  : "neutral"
              }
            >
              {statusLabel}
            </Badge>
            {previewMode && (
              <Badge tone="neutral">Student view — teacher-only blocks hidden</Badge>
            )}
          </div>
        </Card>
      )}

      {previewOnly && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">Student preview</Badge>
            <Link href={`/teacher/assignments/${assignment.id}/builder`}>
              <Button variant="outline">Back to builder</Button>
            </Link>
          </div>
        </Card>
      )}

      <SectionList
        sections={sections}
        onChange={markDirty}
        previewMode={previewMode || previewOnly}
      />

      {sections.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            No sections yet. Click &ldquo;Add section&rdquo; to start building.
          </p>
        </Card>
      )}

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
