"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import type { ActionResult } from "@/lib/actions/auth";
import {
  saveAssignmentCommentsAction,
  saveHomeworkStructureAction,
} from "@/lib/actions/homework-builder";
import { publishHomeworkAction } from "@/lib/actions/teacher";
import { calculateTotalMarks, formatMarkLabel } from "@/lib/homework/marks";
import { collectPublishWarnings } from "@/lib/homework/publish-readiness";
import { createBlock, emptySection } from "@/lib/homework/structure";
import type {
  Assignment,
  AssignmentCommentDraft,
  BuilderSection,
  BuilderStage,
} from "@/lib/types";
import { ContentCanvas, StudentPreview } from "./content-canvas";
import {
  ResourceStage,
  type AssignmentResourceSummary,
  type MarkSchemeSummary,
} from "./resource-stage";
import {
  FeedbackStage,
  normaliseComments,
  type CommentBankOption,
} from "./feedback-stage";

interface Props {
  assignment: Assignment & { template_id: string };
  initialSections: BuilderSection[];
  classNames: string[];
  previewOnly?: boolean;
  resources?: AssignmentResourceSummary[];
  markSchemes?: MarkSchemeSummary[];
  initialComments?: AssignmentCommentDraft[];
  commentBanks?: CommentBankOption[];
  linkedCommentBankIds?: string[];
}

const STAGES: Array<{ id: BuilderStage; label: string }> = [
  { id: "details", label: "Details" },
  { id: "classes", label: "Classes" },
  { id: "content", label: "Content" },
  { id: "resources", label: "Resources" },
  { id: "feedback", label: "Feedback" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
];

export function HomeworkStudio({
  assignment,
  initialSections,
  classNames,
  previewOnly = false,
  resources = [],
  markSchemes = [],
  initialComments = [],
  commentBanks = [],
  linkedCommentBankIds = [],
}: Props) {
  const [sections, setSections] = useState<BuilderSection[]>(initialSections);
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const [comments, setComments] = useState<AssignmentCommentDraft[]>(() =>
    normaliseComments(initialComments),
  );
  const [activeStage, setActiveStage] = useState<BuilderStage>(
    previewOnly ? "preview" : "content",
  );
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [issuedAcknowledged, setIssuedAcknowledged] = useState(
    assignment.status !== "published",
  );
  const [details, setDetails] = useState({
    title: assignment.title,
    overview: assignment.instructions ?? "",
  });

  const totalMarks = useMemo(() => calculateTotalMarks(sections), [sections]);
  const autosave = useVersionedAutosave<BuilderSection[]>({
    delayMs: 1200,
    enabled: !previewOnly,
    save: async (value) => {
      const result = await saveHomeworkStructureAction(assignment.template_id, value);
      return result.error ? { ok: false, error: result.error } : { ok: true };
    },
  });
  const commentAutosave = useVersionedAutosave<AssignmentCommentDraft[]>({
    delayMs: 1200,
    enabled: !previewOnly,
    save: async (value) => {
      const result = await saveAssignmentCommentsAction(
        assignment.template_id,
        value,
      );
      return result.error ? { ok: false, error: result.error } : { ok: true };
    },
  });

  function updateComments(next: AssignmentCommentDraft[]) {
    if (previewOnly) return;
    if (!confirmIssuedEdit()) return;
    const ordered = normaliseComments(next);
    setComments(ordered);
    commentAutosave.markDirty(ordered);
  }

  function confirmIssuedEdit() {
    if (assignment.status !== "published" || issuedAcknowledged) return true;
    const ok = window.confirm(
      "This homework has already been published. Editing content may change what students see and can affect in-progress work. Continue?",
    );
    if (ok) setIssuedAcknowledged(true);
    return ok;
  }

  /** Functional updates prevent stale React closures from wiping nested MCQ edits. */
  function updateSections(updater: (prev: BuilderSection[]) => BuilderSection[]) {
    if (previewOnly) return;
    if (!confirmIssuedEdit()) return;
    const next = updater(sectionsRef.current);
    sectionsRef.current = next;
    setSections(next);
    autosave.markDirty(next);
  }

  function updateLocalDetails(patch: Partial<typeof details>) {
    if (!confirmIssuedEdit()) return;
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  function addExternalVideoBlock(url: string) {
    if (!confirmIssuedEdit()) return;
    const block = createBlock("embedded_video");
    block.external_url = url;
    block.content = "Video";
    block.prompt = "Watch this video before answering the questions.";

    updateSections((prev) =>
      prev.length > 0
        ? prev.map((section, index) =>
            index === 0 ? { ...section, blocks: [...section.blocks, block] } : section,
          )
        : [{ ...emptySection(), blocks: [block] }],
    );
    setActiveStage("content");
  }

  const classSummary = classNames.length > 0 ? classNames.join(", ") : "No classes selected";
  const statusTone = assignment.status === "published" ? "success" : "neutral";

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {details.title || assignment.title}
              </h1>
              <Badge tone={statusTone}>{assignment.status}</Badge>
              <Badge tone="brand">{formatMarkLabel(totalMarks)}</Badge>
            </div>
            <p className="text-sm text-slate-500">{classSummary}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  autosave.status === "error"
                    ? "danger"
                    : autosave.status === "dirty"
                      ? "warning"
                      : "neutral"
                }
              >
                {previewOnly ? "Preview only" : autosave.label}
              </Badge>
              {autosave.lastError ? (
                <span className="text-sm text-rose-600">{autosave.lastError}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeStage === "preview" ? "primary" : "secondary"}
              onClick={() => setActiveStage("preview")}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void autosave.flush()}
              disabled={previewOnly}
            >
              Save draft
            </Button>
            <Button type="button" onClick={() => setActiveStage("publish")}>
              Publish stage
            </Button>
          </div>
        </div>

        {assignment.status === "published" && !previewOnly ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This assignment is published. Homework Studio will ask you to confirm before
            the first edit in this session.
          </div>
        ) : null}

        {!previewOnly ? (
          <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 pt-4">
            {STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-medium transition ${
                  activeStage === stage.id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {stage.label}
              </button>
            ))}
          </nav>
        ) : null}
      </Card>

      {activeStage === "details" ? (
        <DetailsStage details={details} onChange={updateLocalDetails} />
      ) : null}

      {activeStage === "classes" ? <ClassesStage classNames={classNames} /> : null}

      {/* Keep Content mounted when focusing a block from Publish validation. */}
      <div className={activeStage === "content" ? "contents" : "hidden"}>
        <ContentCanvas
          sections={sections}
          onChange={updateSections}
          commentBanks={commentBanks}
          assignmentComments={comments}
          onAssignmentCommentsChange={updateComments}
          assignmentId={assignment.id}
          focusBlockId={focusBlockId}
          onFocusBlockConsumed={() => setFocusBlockId(null)}
        />
      </div>

      {activeStage === "resources" ? (
        <ResourceStage
          assignmentId={assignment.id}
          templateId={assignment.template_id}
          resources={resources}
          markSchemes={markSchemes}
          onAddExternalVideo={addExternalVideoBlock}
        />
      ) : null}

      {/* Keep mounted so comment state / autosave never remounts from stale SSR props. */}
      <div className={activeStage === "feedback" ? "contents" : "hidden"}>
        <FeedbackStage
          templateId={assignment.template_id}
          sections={sections}
          comments={comments}
          onCommentsChange={updateComments}
          commentAutosaveLabel={commentAutosave.label}
          commentAutosaveError={commentAutosave.lastError}
          onFlushComments={() => void commentAutosave.flush()}
          commentBanks={commentBanks}
          linkedCommentBankIds={linkedCommentBankIds}
        />
      </div>

      {activeStage === "preview" ? (
        <StudentPreview sections={sections} />
      ) : null}

      {activeStage === "publish" ? (
        <PublishStage
          assignment={assignment}
          sections={sections}
          flushStructure={async () => (await autosave.flush()).ok}
          flushComments={async () => (await commentAutosave.flush()).ok}
          structureDirty={autosave.hasUnsavedChanges()}
          onGoToBlock={(blockId) => {
            setFocusBlockId(blockId);
            setActiveStage("content");
          }}
        />
      ) : null}
    </div>
  );
}

function DetailsStage({
  details,
  onChange,
}: {
  details: { title: string; overview: string };
  onChange: (patch: Partial<{ title: string; overview: string }>) => void;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Homework details</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          These fields are local to Homework Studio for now. Publish status and dates are
          managed in the Publish stage.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Title</span>
        <Input
          value={details.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Homework title"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Overview</span>
        <Textarea
          value={details.overview}
          onChange={(e) => onChange({ overview: e.target.value })}
          placeholder="Short overview for students"
        />
      </label>
    </Card>
  );
}

function ClassesStage({ classNames }: { classNames: string[] }) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Classes</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Class allocation is shown here read-only. Release dates and due dates are edited
          in the Publish stage.
        </p>
      </div>
      {classNames.length === 0 ? (
        <p className="text-sm text-slate-500">No classes attached.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classNames.map((name) => (
            <li
              key={name}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PublishStage({
  assignment,
  sections,
  flushStructure,
  flushComments,
  structureDirty,
  onGoToBlock,
}: {
  assignment: Assignment;
  sections: BuilderSection[];
  flushStructure: () => Promise<boolean>;
  flushComments: () => Promise<boolean>;
  structureDirty: boolean;
  onGoToBlock: (blockId: string) => void;
}) {
  const bound = publishHomeworkAction.bind(null, assignment.id);
  const [state, action, pending] = useActionState(bound, {} as ActionResult);
  const [flushPending, startFlush] = useTransition();
  const [flushError, setFlushError] = useState<string | null>(null);
  const warnings = collectPublishWarnings(sections);
  const blocking = warnings.filter((w) => w.blocking);
  const isPublished = assignment.status === "published";
  const clientReady = blocking.length === 0;
  // Never show the green ready banner alongside blocking client/server errors.
  const showReadyBanner = clientReady && !flushError && !state.error;

  function handleSubmit(formData: FormData) {
    startFlush(async () => {
      setFlushError(null);
      const structureOk = await flushStructure();
      const commentsOk = await flushComments();
      if (!structureOk || !commentsOk) {
        setFlushError(
          "Save your latest edits before publishing. Autosave did not finish.",
        );
        return;
      }
      // Re-check client structure after flush; server also validates persisted data.
      const latest = collectPublishWarnings(sections);
      if (latest.some((w) => w.blocking)) {
        setFlushError(
          "Fix the blocking issues listed above, then try publishing again.",
        );
        return;
      }
      await action(formData);
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>
          {isPublished ? "Update published homework" : "Publish homework"}
        </CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Homework is created as a draft automatically. Publish when the worksheet is
          ready. Pending autosaves are flushed before publishing.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={isPublished ? "success" : "neutral"}>
          {isPublished ? "Published" : "Draft"}
        </Badge>
        {structureDirty ? <Badge tone="warning">Unsaved content</Badge> : null}
      </div>

      {showReadyBanner ? (
        <div className="border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          Homework is ready to publish.
        </div>
      ) : null}
      {!clientReady ? (
        <div className="border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          <p className="mb-2 font-medium">Validation summary</p>
          <ul className="space-y-3">
            {blocking.map((w) => (
              <li
                key={`${w.blockId}-${w.message}`}
                className="rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2"
              >
                <p className="font-medium">
                  {w.questionNumber != null
                    ? `Question ${w.questionNumber}`
                    : "Block"}
                  {w.questionTitle ? `, "${w.questionTitle}"` : ""}
                </p>
                <p className="mt-0.5 text-amber-900/90">{w.message}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => onGoToBlock(w.blockId)}
                >
                  Go to question
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.some((w) => !w.blocking) ? (
        <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="mb-1 font-medium">Non-blocking notes</p>
          <ul className="list-disc space-y-1 pl-5">
            {warnings
              .filter((w) => !w.blocking)
              .slice(0, 6)
              .map((w) => (
                <li key={`${w.blockId}-${w.message}`}>{w.message}</li>
              ))}
          </ul>
        </div>
      ) : null}

      <form action={handleSubmit} className="space-y-4">
        {flushError || state.error ? (
          <div className="whitespace-pre-wrap border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {flushError || state.error}
          </div>
        ) : null}
        {state.success ? (
          <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {state.success}
          </div>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Due date
          </span>
          <Input
            type="datetime-local"
            name="due_at"
            defaultValue={toLocalInput(assignment.due_at)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Release date (optional)
          </span>
          <Input
            type="datetime-local"
            name="release_at"
            defaultValue={toLocalInput(assignment.release_at)}
          />
          <span className="mt-1 block text-xs text-slate-400">
            Leave empty to release immediately on publish.
          </span>
        </label>

        {isPublished ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="confirm_published_edit"
              className="mt-1 accent-brand-600"
            />
            <span>
              I understand these changes will update the active published homework
              students can already see.
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={pending || flushPending || !clientReady}
          >
            {pending || flushPending
              ? "Saving & publishing…"
              : isPublished
                ? "Update published homework"
                : "Publish homework"}
          </Button>
          <Link href={`/teacher/assignments/${assignment.id}/edit`}>
            <Button type="button" variant="outline">
              Edit details
            </Button>
          </Link>
        </div>
      </form>
    </Card>
  );
}
