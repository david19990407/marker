"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  StructuredWorksheetRenderer,
  buildValuesFromResponses,
} from "@/components/shared/structured-worksheet-renderer";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import { AnnotationToolbar } from "@/components/teacher/marking/annotation-toolbar";
import { AnnotationLayer } from "@/components/teacher/marking/annotation-layer";
import { FileViewer } from "@/components/teacher/marking/file-viewer";
import { QuestionMarkControls } from "@/components/teacher/marking/question-mark-controls";
import {
  deleteAnnotationAction,
  saveAnnotationAction,
  saveQuestionMarkAction,
} from "@/lib/actions/marking-annotations";
import {
  evaluateStructuredCompletion,
  isAssessableStudentBlock,
  isStructuredResponseAnswered,
  type ResponseSnapshot,
} from "@/lib/homework/completion";
import { formatMarkLabel } from "@/lib/homework/marks";
import { flattenStudentBlocks } from "@/lib/homework/structure";
import type {
  AssignmentFeedbackField,
  CommentBankItem,
  FeedbackFieldValue,
} from "@/lib/feedback/types";
import type {
  AnnotationTool,
  MarkingStamp,
  QuestionMarkRecord,
  SubmissionAnnotation,
} from "@/lib/marking/annotation-types";
import {
  deriveMarkingStatus,
  inferMarkingMode,
  nextUnmarkedQuestionId,
  sumAwardedMarks,
} from "@/lib/marking/question-marks";
import { createUndoStack } from "@/lib/marking/undo-stack";
import type {
  AssignmentCommentDraft,
  BuilderSection,
  Feedback,
} from "@/lib/types";
import type { MarkingResponse } from "@/components/teacher/structured-marking-workspace";

type ResourceFile = { id: string; file_name: string; storage_path: string };
type MarkSchemeFile = {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
};

type CentreView =
  | { kind: "worksheet" }
  | {
      kind: "file";
      fileName: string;
      path: string;
      bucket: "student-submissions" | "assignment-resources";
    };

export function DocumentMarkingWorkspace({
  submissionId,
  assignmentId,
  classId,
  className,
  maximumMark,
  feedback,
  sections,
  responses,
  resources = [],
  markSchemes = [],
  commentBanks = [],
  assignmentComments = [],
  feedbackFields = [],
  feedbackFieldValues = [],
  commentBankItems = [],
  studentName = "",
  assignmentTitle = "",
  submissionStatus,
  submittedAt,
  navIndex,
  navTotal,
  prevSubmissionId,
  nextSubmissionId,
  unmarkedOnly = false,
  initialAnnotations = [],
  initialQuestionMarks = [],
  stamps = [],
  circularThreshold = 10,
  allowDecimalMarks = false,
  annotationDefaultVisibility = "teacher_only",
  legacyFileName = null,
  legacyStoragePath = null,
}: {
  submissionId: string;
  assignmentId: string;
  classId: string;
  className?: string | null;
  maximumMark: number;
  feedback: Feedback | null;
  sections: BuilderSection[];
  responses: MarkingResponse[];
  resources?: ResourceFile[];
  markSchemes?: MarkSchemeFile[];
  commentBanks?: Array<{ id: string; name: string }>;
  assignmentComments?: Array<
    Pick<
      AssignmentCommentDraft,
      | "_id"
      | "short_label"
      | "full_comment"
      | "category"
      | "linked_question_id"
      | "linked_question_ids"
      | "is_active"
      | "available_for_question"
      | "available_for_overall"
      | "available_for_annotation"
    >
  >;
  feedbackFields?: AssignmentFeedbackField[];
  feedbackFieldValues?: FeedbackFieldValue[];
  commentBankItems?: CommentBankItem[];
  studentName?: string;
  assignmentTitle?: string;
  submissionStatus: string;
  submittedAt?: string | null;
  navIndex: number;
  navTotal: number;
  prevSubmissionId?: string | null;
  nextSubmissionId?: string | null;
  unmarkedOnly?: boolean;
  initialAnnotations?: SubmissionAnnotation[];
  initialQuestionMarks?: QuestionMarkRecord[];
  stamps?: MarkingStamp[];
  circularThreshold?: number;
  allowDecimalMarks?: boolean;
  annotationDefaultVisibility?: "teacher_only" | "student_visible";
  legacyFileName?: string | null;
  legacyStoragePath?: string | null;
}) {
  const assessable = useMemo(
    () => flattenStudentBlocks(sections).filter(isAssessableStudentBlock),
    [sections],
  );
  const questionIds = useMemo(
    () =>
      assessable
        .map((b) => b.question_id)
        .filter((id): id is string => Boolean(id)),
    [assessable],
  );

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        const saved = window.sessionStorage.getItem(
          `marking:last-question:${submissionId}`,
        );
        if (saved && questionIds.includes(saved)) return saved;
      }
      return questionIds[0] ?? null;
    },
  );
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<"questions" | "files" | "resources">(
    "questions",
  );
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(360);
  const [centreView, setCentreView] = useState<CentreView>({ kind: "worksheet" });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<"none" | "width" | "page">("width");
  const [fullscreen, setFullscreen] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [colour, setColour] = useState("#ef4444");
  const [selectedStampId, setSelectedStampId] = useState<string | null>(
    stamps[0]?.id ?? null,
  );
  const [annotations, setAnnotations] =
    useState<SubmissionAnnotation[]>(initialAnnotations);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    null,
  );
  const [questionMarks, setQuestionMarks] = useState<QuestionMarkRecord[]>(
    initialQuestionMarks,
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [, startTransition] = useTransition();
  const undoRef = useRef(createUndoStack<SubmissionAnnotation[]>());
  const pendingSaves = useRef(0);
  const paperRef = useRef<HTMLDivElement>(null);

  function syncUndoButtons() {
    setCanUndo(undoRef.current.canUndo());
    setCanRedo(undoRef.current.canRedo());
  }

  const responseMap = useMemo(() => {
    const map = new Map<string, MarkingResponse>();
    for (const response of responses) map.set(response.question_id, response);
    return map;
  }, [responses]);

  const snapshots: ResponseSnapshot[] = useMemo(
    () =>
      responses.map((r) => ({
        question_id: r.question_id,
        text_value: r.text_value,
        numeric_value: r.numeric_value,
        boolean_value: r.boolean_value,
        json_value: r.json_value,
        file_name: r.file_name,
        storage_path: r.storage_path,
        cells: r.cells,
      })),
    [responses],
  );

  const completion = useMemo(
    () => evaluateStructuredCompletion(sections, snapshots),
    [sections, snapshots],
  );

  const worksheetValues = useMemo(
    () => buildValuesFromResponses(sections, responses),
    [sections, responses],
  );

  const marksByQuestion = useMemo(() => {
    const map = new Map<string, QuestionMarkRecord>();
    for (const row of questionMarks) map.set(row.question_id, row);
    return map;
  }, [questionMarks]);

  const markTotals = useMemo(
    () => sumAwardedMarks(questionMarks),
    [questionMarks],
  );

  const selectedBlock = useMemo(
    () =>
      assessable.find((b) => b.question_id === selectedQuestionId) ??
      assessable[0] ??
      null,
    [assessable, selectedQuestionId],
  );

  const selectedMark = selectedQuestionId
    ? marksByQuestion.get(selectedQuestionId)
    : undefined;

  useEffect(() => {
    if (!selectedQuestionId) return;
    window.sessionStorage.setItem(
      `marking:last-question:${submissionId}`,
      selectedQuestionId,
    );
    const el = document.querySelector(
      `[data-question-id="${selectedQuestionId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedQuestionId, submissionId]);

  const flushPending = useCallback(async () => {
    window.dispatchEvent(new Event("marking:save-before-nav"));
    setSaveStatus("saving");
    const deadline = Date.now() + 8000;
    while (pendingSaves.current > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 80));
    }
    if (pendingSaves.current > 0) {
      setSaveStatus("error");
      setSaveError("Save still in progress. Retry before leaving.");
      return false;
    }
    setSaveStatus("saved");
    return true;
  }, []);

  async function persistAnnotation(
    next: SubmissionAnnotation,
    previous: SubmissionAnnotation[] | null,
  ) {
    pendingSaves.current += 1;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const result = await saveAnnotationAction({
        ...next,
        submission_id: submissionId,
        assignment_id: assignmentId,
      });
      if (result.error || !result.annotation) {
        setSaveStatus("error");
        setSaveError(result.error ?? "Save failed");
        if (previous) setAnnotations(previous);
        return;
      }
      setAnnotations((prev) => {
        const without = prev.filter((a) => a.id !== result.annotation!.id);
        return [...without, result.annotation!];
      });
      setSaveStatus("saved");
    } finally {
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    }
  }

  function createAnnotation(draft: {
    annotation_type: SubmissionAnnotation["annotation_type"];
    x_norm: number;
    y_norm: number;
    w_norm: number;
    h_norm: number;
    text_content?: string | null;
    geometry?: Record<string, unknown>;
  }) {
    const previous = annotations;
    const tempId = crypto.randomUUID();
    const created: SubmissionAnnotation = {
      id: tempId,
      submission_id: submissionId,
      assignment_id: assignmentId,
      question_id: selectedQuestionId,
      block_id: selectedBlock?._id ?? null,
      page_number: null,
      target_kind: centreView.kind === "worksheet" ? "worksheet" : "file",
      target_path: centreView.kind === "file" ? centreView.path : null,
      annotation_type: draft.annotation_type,
      x_norm: draft.x_norm,
      y_norm: draft.y_norm,
      w_norm: draft.w_norm,
      h_norm: draft.h_norm,
      geometry: draft.geometry ?? {},
      text_content: draft.text_content ?? null,
      colour,
      opacity: draft.annotation_type === "freehand" ? 0.55 : 0.35,
      stroke_width: 2,
      stamp_id: draft.annotation_type === "stamp" ? selectedStampId : null,
      visibility: annotationDefaultVisibility,
      client_version: 1,
      is_deleted: false,
      created_by: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = [...annotations, created];
    setAnnotations(next);
    undoRef.current.push({
      label: "add",
      undo: () => previous,
      redo: () => next,
    });
    syncUndoButtons();
    startTransition(() => {
      void persistAnnotation(created, previous);
    });
  }

  function updateMark(patch: Partial<QuestionMarkRecord>) {
    if (!selectedQuestionId || !selectedBlock) return;
    const mode = inferMarkingMode(selectedBlock);
    const existing = marksByQuestion.get(selectedQuestionId);
    const next: QuestionMarkRecord = {
      submission_id: submissionId,
      question_id: selectedQuestionId,
      marking_mode: mode,
      awarded_mark: existing?.awarded_mark ?? null,
      maximum_mark: Number(selectedBlock.max_marks ?? 0),
      review_state: existing?.review_state ?? null,
      marking_status: existing?.marking_status ?? "unmarked",
      question_feedback: existing?.question_feedback ?? null,
      teacher_only_note: existing?.teacher_only_note ?? null,
      automatic_mark: existing?.automatic_mark ?? null,
      override_mark: existing?.override_mark ?? null,
      override_reason: existing?.override_reason ?? null,
      flagged: existing?.flagged ?? false,
      client_version: (existing?.client_version ?? 0) + 1,
      ...patch,
    };
    next.marking_status = deriveMarkingStatus({
      mode: next.marking_mode,
      awardedMark: next.awarded_mark,
      reviewState: next.review_state,
      feedback: next.question_feedback,
      flagged: next.flagged,
    });
    setQuestionMarks((prev) => {
      const others = prev.filter((m) => m.question_id !== selectedQuestionId);
      return [...others, next];
    });
    pendingSaves.current += 1;
    setSaveStatus("saving");
    startTransition(async () => {
      try {
        const result = await saveQuestionMarkAction(next);
        if (result.error) {
          setSaveStatus("error");
          setSaveError(result.error);
          return;
        }
        if (result.mark) {
          setQuestionMarks((prev) => {
            const others = prev.filter(
              (m) => m.question_id !== result.mark!.question_id,
            );
            return [...others, result.mark!];
          });
        }
        setSaveStatus("saved");
      } finally {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      }
    });
  }

  async function goQuestion(direction: -1 | 1) {
    if (!questionIds.length) return;
    await flushPending();
    const idx = selectedQuestionId
      ? questionIds.indexOf(selectedQuestionId)
      : 0;
    const next = questionIds[Math.min(questionIds.length - 1, Math.max(0, idx + direction))];
    if (next) setSelectedQuestionId(next);
  }

  async function goNextUnmarked() {
    await flushPending();
    const next = nextUnmarkedQuestionId(
      questionIds,
      marksByQuestion,
      selectedQuestionId,
    );
    if (next) setSelectedQuestionId(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") goQuestion(-1);
      if (e.key === "ArrowRight") goQuestion(1);
      if (e.key === "u") goNextUnmarked();
      if (e.key === "f") updateMark({ flagged: !selectedMark?.flagged });
      if (/^[0-9]$/.test(e.key) && selectedBlock) {
        const max = Number(selectedBlock.max_marks ?? 0);
        const value = Number(e.key);
        if (value <= max && max <= circularThreshold) updateMark({ awarded_mark: value });
      }
      if (e.key === "+" || e.key === "=") {
        const max = Number(selectedBlock?.max_marks ?? 0);
        updateMark({
          awarded_mark: Math.min(max, Number(selectedMark?.awarded_mark ?? 0) + 1),
        });
      }
      if (e.key === "-") {
        updateMark({
          awarded_mark: Math.max(0, Number(selectedMark?.awarded_mark ?? 0) - 1),
        });
      }
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuestionId, selectedMark, selectedBlock, fullscreen, circularThreshold]);

  const shellClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-slate-100"
    : "flex min-h-[calc(100vh-8rem)] flex-col rounded-2xl border border-slate-200 bg-slate-100";

  return (
    <div className={shellClass}>
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{studentName || "Student"}</p>
          <p className="truncate text-xs text-slate-300">
            {assignmentTitle}
            {className ? ` · ${className}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">{submissionStatus}</Badge>
          {submittedAt ? (
            <span className="text-slate-300">
              {new Date(submittedAt).toLocaleString("en-GB")}
            </span>
          ) : null}
          <span>
            {navIndex >= 0 ? navIndex + 1 : "—"} of {navTotal || "—"}
          </span>
          <span
            className={
              saveStatus === "error"
                ? "text-rose-300"
                : saveStatus === "saving"
                  ? "text-amber-200"
                  : "text-emerald-200"
            }
          >
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? saveError ?? "Save failed"
                : saveStatus === "saved"
                  ? "Saved"
                  : "Ready"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/teacher/marking/classes/${classId}/assignments/${assignmentId}${
              unmarkedOnly ? "?filter=unmarked" : ""
            }`}
          >
            <Button size="sm" variant="outline">
              Return
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            disabled={!prevSubmissionId}
            onClick={async () => {
              if (!prevSubmissionId) return;
              const ok = await flushPending();
              if (ok) {
                window.location.href = `/teacher/marking/submissions/${prevSubmissionId}${
                  unmarkedOnly ? "?filter=unmarked" : ""
                }`;
              }
            }}
          >
            Previous student
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!nextSubmissionId}
            onClick={async () => {
              if (!nextSubmissionId) return;
              const ok = await flushPending();
              if (ok) {
                window.location.href = `/teacher/marking/submissions/${nextSubmissionId}${
                  unmarkedOnly ? "?filter=unmarked" : ""
                }`;
              }
            }}
          >
            Next student
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left pane */}
        {leftOpen ? (
          <aside
            className="flex shrink-0 flex-col border-r border-slate-200 bg-white"
            style={{ width: leftWidth }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-2 py-2">
              <div className="flex gap-1">
                {(["questions", "files", "resources"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`rounded-lg px-2 py-1 text-xs capitalize ${
                      leftTab === tab ? "bg-slate-900 text-white" : "text-slate-600"
                    }`}
                    onClick={() => setLeftTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => setLeftOpen(false)}
              >
                Collapse
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 text-sm">
              {leftTab === "questions" ? (
                <ul className="space-y-1">
                  {assessable.map((block, index) => {
                    const qid = block.question_id!;
                    const mark = marksByQuestion.get(qid);
                    const answered = isStructuredResponseAnswered(
                      block,
                      responseMap.get(qid) ?? null,
                    );
                    const active = selectedQuestionId === qid;
                    return (
                      <li key={qid}>
                        <button
                          type="button"
                          className={`w-full rounded-xl px-2 py-2 text-left ${
                            active ? "bg-brand-50 text-brand-900" : "hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            setCentreView({ kind: "worksheet" });
                            setSelectedQuestionId(qid);
                          }}
                        >
                          <span className="block font-medium">
                            Q{index + 1}. {block.content || block.prompt || "Question"}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {answered ? "Answered" : "Unanswered"} ·{" "}
                            {mark?.awarded_mark ?? "—"}/
                            {block.max_marks ?? 0}
                            {block.required ? " · Required" : ""}
                            {mark?.flagged ? " · Flagged" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {leftTab === "files" ? (
                <ul className="space-y-2">
                  {legacyFileName && legacyStoragePath ? (
                    <li>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
                        onClick={() =>
                          setCentreView({
                            kind: "file",
                            fileName: legacyFileName,
                            path: legacyStoragePath,
                            bucket: "student-submissions",
                          })
                        }
                      >
                        {legacyFileName}
                      </button>
                    </li>
                  ) : null}
                  {responses
                    .filter((r) => r.storage_path && r.file_name)
                    .map((r) => (
                      <li key={`${r.question_id}-${r.storage_path}`}>
                        <button
                          type="button"
                          className="w-full rounded-xl border border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
                          onClick={() =>
                            setCentreView({
                              kind: "file",
                              fileName: r.file_name!,
                              path: r.storage_path!,
                              bucket: "student-submissions",
                            })
                          }
                        >
                          {r.file_name}
                        </button>
                      </li>
                    ))}
                  {!legacyFileName &&
                  !responses.some((r) => r.storage_path) ? (
                    <li className="text-xs text-slate-500">
                      No student file uploads
                    </li>
                  ) : null}
                </ul>
              ) : null}
              {leftTab === "resources" ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
                      Resources
                    </p>
                    <ul className="space-y-1">
                      {resources.map((file) => (
                        <li key={file.id}>
                          <button
                            type="button"
                            className="w-full rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                            onClick={() =>
                              setCentreView({
                                kind: "file",
                                fileName: file.file_name,
                                path: file.storage_path,
                                bucket: "assignment-resources",
                              })
                            }
                          >
                            {file.file_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
                      Mark schemes
                    </p>
                    <ul className="space-y-1">
                      {markSchemes.map((file) => (
                        <li key={file.id}>
                          <button
                            type="button"
                            className="w-full rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                            onClick={() =>
                              setCentreView({
                                kind: "file",
                                fileName: file.file_name,
                                path: file.storage_path,
                                bucket: "assignment-resources",
                              })
                            }
                          >
                            {file.title || file.file_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t border-slate-100 p-2 text-[11px] text-slate-500">
              Drag edge to resize · {leftWidth}px
              <input
                type="range"
                min={200}
                max={420}
                value={leftWidth}
                onChange={(e) => setLeftWidth(Number(e.target.value))}
                className="mt-1 w-full"
                aria-label="Resize left pane"
              />
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="w-8 border-r border-slate-200 bg-white text-xs"
            onClick={() => setLeftOpen(true)}
          >
            »»
          </button>
        )}

        <AnnotationToolbar
          tool={tool}
          colour={colour}
          stamps={stamps}
          selectedStampId={selectedStampId}
          canUndo={canUndo}
          canRedo={canRedo}
          onToolChange={setTool}
          onColourChange={setColour}
          onStampSelect={setSelectedStampId}
          onUndo={() => {
            const prev = undoRef.current.undo();
            if (prev) {
              setAnnotations(prev);
              syncUndoButtons();
            }
          }}
          onRedo={() => {
            const next = undoRef.current.redo();
            if (next) {
              setAnnotations(next);
              syncUndoButtons();
            }
          }}
        />

        {/* Centre canvas */}
        <main className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFit("none");
                setZoom((z) => Math.max(0.5, z - 0.1));
              }}
            >
              Zoom −
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFit("none");
                setZoom((z) => Math.min(2, z + 0.1));
              }}
            >
              Zoom +
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFit("width")}>
              Fit width
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFit("page")}>
              Fit page
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCentreView({ kind: "worksheet" })}
            >
              Worksheet
            </Button>
            <span className="text-slate-500">
              Question{" "}
              {selectedQuestionId
                ? questionIds.indexOf(selectedQuestionId) + 1
                : "—"}{" "}
              of {questionIds.length} · {markTotals.markedCount} marked · Total{" "}
              {markTotals.awarded}/{maximumMark}
            </span>
          </div>

          {centreView.kind === "file" ? (
            <FileViewer
              fileName={centreView.fileName}
              storagePath={centreView.path}
              bucket={centreView.bucket}
              zoom={zoom}
              fit={fit}
            />
          ) : (
            <div className="h-[calc(100%-2.5rem)] overflow-auto bg-slate-300/50 p-6">
              <div
                ref={paperRef}
                className="relative mx-auto max-w-4xl rounded-sm bg-white p-8 shadow-xl"
                style={{
                  transform:
                    fit === "width"
                      ? "none"
                      : fit === "page"
                        ? "scale(0.92)"
                        : `scale(${zoom})`,
                  transformOrigin: "top center",
                }}
              >
                <StructuredWorksheetRenderer
                  sections={sections}
                  values={worksheetValues}
                  mode="teacher_marking"
                  showTeacherGuidance
                  selectedQuestionId={selectedQuestionId}
                  onSelectQuestion={(qid) => setSelectedQuestionId(qid)}
                />
                <AnnotationLayer
                  annotations={annotations.filter(
                    (a) => a.target_kind === "worksheet" && !a.is_deleted,
                  )}
                  tool={tool}
                  colour={colour}
                  selectedId={selectedAnnotationId}
                  stamps={stamps}
                  stampSizePct={
                    stamps.find((s) => s.id === selectedStampId)?.default_size_pct ??
                    8
                  }
                  onSelect={(id) => {
                    setSelectedAnnotationId(id);
                    if (tool === "delete" && id) {
                      const target = annotations.find((a) => a.id === id);
                      if (!target) return;
                      const previous = annotations;
                      const next = annotations.filter((a) => a.id !== id);
                      setAnnotations(next);
                      undoRef.current.push({
                        label: "delete",
                        undo: () => previous,
                        redo: () => next,
                      });
                      syncUndoButtons();
                      startTransition(async () => {
                        pendingSaves.current += 1;
                        try {
                          await deleteAnnotationAction(
                            id,
                            submissionId,
                            target.client_version,
                          );
                        } finally {
                          pendingSaves.current = Math.max(
                            0,
                            pendingSaves.current - 1,
                          );
                        }
                      });
                    }
                  }}
                  onCreate={createAnnotation}
                  onMove={(id, geometry) => {
                    setAnnotations((prev) =>
                      prev.map((a) =>
                        a.id === id
                          ? {
                              ...a,
                              ...geometry,
                              client_version: a.client_version + 1,
                            }
                          : a,
                      ),
                    );
                    const current = annotations.find((a) => a.id === id);
                    if (!current) return;
                    startTransition(() => {
                      void persistAnnotation(
                        {
                          ...current,
                          ...geometry,
                          client_version: current.client_version + 1,
                        },
                        null,
                      );
                    });
                  }}
                />
              </div>
            </div>
          )}
        </main>

        {/* Right panel */}
        {rightOpen ? (
          <aside
            className="flex shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white"
            style={{ width: rightWidth }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Marking
              </p>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => setRightOpen(false)}
              >
                Collapse
              </button>
            </div>
            <div className="space-y-4 p-3">
              {selectedAnnotationId ? (
                <Card className="space-y-2 p-3 shadow-none">
                  <CardTitle className="text-sm">Selected annotation</CardTitle>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        annotations.find((a) => a.id === selectedAnnotationId)
                          ?.visibility === "student_visible"
                      }
                      onChange={(e) => {
                        const target = annotations.find(
                          (a) => a.id === selectedAnnotationId,
                        );
                        if (!target) return;
                        const next = {
                          ...target,
                          visibility: e.target.checked
                            ? ("student_visible" as const)
                            : ("teacher_only" as const),
                          client_version: target.client_version + 1,
                        };
                        setAnnotations((prev) =>
                          prev.map((a) => (a.id === next.id ? next : a)),
                        );
                        startTransition(() => {
                          void persistAnnotation(next, null);
                        });
                      }}
                    />
                    Visible to student after release
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setColour(
                        annotations.find((a) => a.id === selectedAnnotationId)
                          ?.colour ?? colour,
                      );
                      const target = annotations.find(
                        (a) => a.id === selectedAnnotationId,
                      );
                      if (!target) return;
                      const next = {
                        ...target,
                        colour,
                        client_version: target.client_version + 1,
                      };
                      setAnnotations((prev) =>
                        prev.map((a) => (a.id === next.id ? next : a)),
                      );
                      startTransition(() => {
                        void persistAnnotation(next, null);
                      });
                    }}
                  >
                    Apply selected colour
                  </Button>
                </Card>
              ) : null}

              <Card className="space-y-3 p-3 shadow-none">
                <CardTitle className="text-sm">Question</CardTitle>
                {selectedBlock ? (
                  <QuestionMarkControls
                    questionLabel={
                      selectedBlock.content ||
                      selectedBlock.prompt ||
                      "Question"
                    }
                    maximumMark={Number(selectedBlock.max_marks ?? 0)}
                    mode={inferMarkingMode(selectedBlock)}
                    record={selectedMark}
                    circularThreshold={circularThreshold}
                    allowDecimals={allowDecimalMarks}
                    onAward={(mark) => updateMark({ awarded_mark: mark })}
                    onReview={(state) => updateMark({ review_state: state })}
                    onFeedback={(text) => updateMark({ question_feedback: text })}
                    onFlag={(flagged) => updateMark({ flagged })}
                    onPrev={() => goQuestion(-1)}
                    onNext={() => goQuestion(1)}
                    onNextUnmarked={goNextUnmarked}
                  />
                ) : (
                  <p className="text-sm text-slate-500">No assessable questions.</p>
                )}
              </Card>

              <Card className="space-y-2 p-3 shadow-none">
                <CardTitle className="text-sm">Linked comments</CardTitle>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {assignmentComments
                    .filter((c) => c.is_active)
                    .filter((c) => {
                      if (!selectedQuestionId) return c.available_for_overall;
                      const linked = c.linked_question_ids?.length
                        ? c.linked_question_ids
                        : c.linked_question_id
                          ? [c.linked_question_id]
                          : [];
                      if (linked.includes(selectedQuestionId)) return true;
                      return c.available_for_overall;
                    })
                    .map((c) => (
                      <li key={c._id}>
                        <button
                          type="button"
                          className="w-full rounded-lg border border-slate-100 px-2 py-1.5 text-left hover:bg-slate-50"
                          onClick={() =>
                            updateMark({
                              question_feedback: [
                                selectedMark?.question_feedback?.trim(),
                                c.full_comment,
                              ]
                                .filter(Boolean)
                                .join("\n\n"),
                            })
                          }
                        >
                          <span className="font-medium">{c.short_label}</span>
                          <span className="block text-slate-500">
                            {c.full_comment}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
                {commentBanks.length ? (
                  <p className="text-[11px] text-slate-400">
                    Linked banks: {commentBanks.map((b) => b.name).join(", ")}
                  </p>
                ) : null}
              </Card>

              <Card className="p-3 shadow-none">
                <CardTitle className="mb-3 text-sm">Assignment feedback</CardTitle>
                <FeedbackForm
                  submissionId={submissionId}
                  maximumMark={maximumMark}
                  feedback={feedback}
                  fields={feedbackFields}
                  fieldValues={feedbackFieldValues}
                  commentItems={commentBankItems}
                  studentName={studentName}
                  assignmentTitle={assignmentTitle}
                />
              </Card>

              <p className="text-xs text-slate-500">
                Progress: {completion.answeredAssessableCount}/
                {completion.assessableCount} answered ·{" "}
                {markTotals.markedCount}/{questionIds.length} marked ·{" "}
                {formatMarkLabel(markTotals.awarded)} awarded
              </p>
            </div>
            <div className="border-t border-slate-100 p-2 text-[11px] text-slate-500">
              <input
                type="range"
                min={300}
                max={520}
                value={rightWidth}
                onChange={(e) => setRightWidth(Number(e.target.value))}
                className="w-full"
                aria-label="Resize right pane"
              />
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="w-8 border-l border-slate-200 bg-white text-xs"
            onClick={() => setRightOpen(true)}
          >
            ««
          </button>
        )}
      </div>
    </div>
  );
}
