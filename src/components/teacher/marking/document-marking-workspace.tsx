"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  StructuredWorksheetRenderer,
  buildValuesFromResponses,
} from "@/components/shared/structured-worksheet-renderer";
import { FeedbackForm } from "@/components/teacher/feedback-form";
import { AnnotationToolbar } from "@/components/teacher/marking/annotation-toolbar";
import { AnnotationLayer } from "@/components/teacher/marking/annotation-layer";
import { FileViewer } from "@/components/teacher/marking/file-viewer";
import { LinkedCommentsPanel } from "@/components/teacher/marking/linked-comments-panel";
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
import { speechBubbleBox } from "@/lib/marking/annotation-geometry";
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

type AnnotationGeometryPatch = Pick<
  SubmissionAnnotation,
  "x_norm" | "y_norm" | "w_norm" | "h_norm"
>;

type CommentPayload = { id: string; text: string };

const TOOLBAR_DOCKED_KEY = "marking:toolbar-docked";
const TOOLBAR_COLLAPSED_KEY = "marking:toolbar-collapsed";
const TOOLBAR_POS_KEY = "marking:toolbar-pos";
const DEFAULT_FLOATING_POS = { x: 56, y: 72 };
const DEFAULT_COMMENT_BOX = { w: 0.24, h: 0.09 };
const TOOLBAR_MIN_WIDTH = 56;
const NAV_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 300;

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

function readStoredFloatingPos() {
  if (typeof window === "undefined") return DEFAULT_FLOATING_POS;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TOOLBAR_POS_KEY) || "",
    ) as Partial<typeof DEFAULT_FLOATING_POS>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Fall through to the default position.
  }
  return DEFAULT_FLOATING_POS;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Clamp floating toolbar to the marking workspace bounds (not the viewport). */
function clampToolbarPos(
  pos: { x: number; y: number },
  workspace: HTMLElement | null,
) {
  if (!workspace) {
    return {
      x: Math.max(8, pos.x),
      y: Math.max(8, pos.y),
    };
  }
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  return {
    x: clamp(pos.x, 8, Math.max(8, width - TOOLBAR_MIN_WIDTH - 8)),
    y: clamp(pos.y, 8, Math.max(8, height - 72)),
  };
}

function boxAroundPoint(point: { x: number; y: number }) {
  const w = DEFAULT_COMMENT_BOX.w;
  const h = DEFAULT_COMMENT_BOX.h;
  return {
    x: clamp(point.x - w / 2, 0, 1 - w),
    y: clamp(point.y - h / 2, 0, 1 - h),
    w,
    h,
  };
}

function appendFeedback(existing: string | null | undefined, text: string) {
  return [existing?.trim(), text.trim()].filter(Boolean).join("\n\n");
}

function formatJsonValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function askCommentAnnotationKind(
  fallback: "area_comment" | "text_comment" = "area_comment",
) {
  const raw = window.prompt("Type box or bubble", fallback === "text_comment" ? "bubble" : "box");
  if (raw == null) return null;
  return raw.trim().toLowerCase() === "bubble" ? "text_comment" : "area_comment";
}

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
  void annotationDefaultVisibility;

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
  const [toolbarDocked, setToolbarDocked] = useState(() =>
    readStoredBoolean(TOOLBAR_DOCKED_KEY, true),
  );
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() =>
    readStoredBoolean(TOOLBAR_COLLAPSED_KEY, false),
  );
  const [floatingPos, setFloatingPos] = useState(readStoredFloatingPos);
  const [fullscreen, setFullscreen] = useState(false);
  const [, startTransition] = useTransition();
  const undoRef = useRef(createUndoStack<SubmissionAnnotation[]>());
  const pendingSaves = useRef(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const annotationsRef = useRef(initialAnnotations);

  const updateAnnotations = useCallback(
    (updater: (prev: SubmissionAnnotation[]) => SubmissionAnnotation[]) => {
      setAnnotations((prev) => {
        const next = updater(prev);
        annotationsRef.current = next;
        return next;
      });
    },
    [],
  );

  const replaceAnnotations = useCallback((next: SubmissionAnnotation[]) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

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
  const selectedResponse = selectedQuestionId
    ? responseMap.get(selectedQuestionId)
    : undefined;
  const selectedQuestionIndex = selectedQuestionId
    ? questionIds.indexOf(selectedQuestionId)
    : -1;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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

  useEffect(() => {
    window.localStorage.setItem(TOOLBAR_DOCKED_KEY, String(toolbarDocked));
  }, [toolbarDocked]);

  useEffect(() => {
    window.localStorage.setItem(TOOLBAR_COLLAPSED_KEY, String(toolbarCollapsed));
  }, [toolbarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(floatingPos));
  }, [floatingPos]);

  useEffect(() => {
    function clampToWorkspace() {
      setFloatingPos((prev) => clampToolbarPos(prev, workspaceRef.current));
    }
    clampToWorkspace();
    window.addEventListener("resize", clampToWorkspace);
    return () => window.removeEventListener("resize", clampToWorkspace);
  }, [fullscreen, toolbarDocked]);

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
        if (previous) replaceAnnotations(previous);
        return;
      }
      updateAnnotations((prev) => {
        const without = prev.filter(
          (a) => a.id !== next.id && a.id !== result.annotation!.id,
        );
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
    source_comment_item_id?: string | null;
  }) {
    const previous = annotationsRef.current;
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
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
      source_comment_item_id: draft.source_comment_item_id ?? null,
      visibility: "student_visible",
      client_version: 1,
      is_deleted: false,
      created_by: "",
      created_at: now,
      updated_at: now,
    };
    const next = [...previous, created];
    replaceAnnotations(next);
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
    setSaveError(null);
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
    const next =
      questionIds[Math.min(questionIds.length - 1, Math.max(0, idx + direction))];
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

  function appendCommentToFeedback(text: string) {
    updateMark({
      question_feedback: appendFeedback(selectedMark?.question_feedback, text),
    });
  }

  function createCommentAnnotation(
    point: { x: number; y: number },
    comment: CommentPayload,
    kind: "area_comment" | "text_comment",
  ) {
    if (kind === "text_comment") {
      const bubble = speechBubbleBox(point);
      createAnnotation({
        annotation_type: "text_comment",
        x_norm: bubble.x,
        y_norm: bubble.y,
        w_norm: bubble.w,
        h_norm: bubble.h,
        text_content: comment.text,
        source_comment_item_id: comment.id,
      });
      return;
    }

    const box = boxAroundPoint(point);
    createAnnotation({
      annotation_type: "area_comment",
      x_norm: box.x,
      y_norm: box.y,
      w_norm: box.w,
      h_norm: box.h,
      text_content: comment.text,
      source_comment_item_id: comment.id,
    });
  }

  function handleCommentDrop(point: { x: number; y: number }, comment: CommentPayload) {
    const kind = askCommentAnnotationKind("area_comment");
    if (!kind) return;
    createCommentAnnotation(point, comment, kind);
  }

  function handleClickInsertAnnotation(comment: CommentPayload) {
    const point = { x: 0.5, y: 0.5 };
    if (tool === "area_comment" || tool === "text_comment") {
      createCommentAnnotation(point, comment, tool);
      return;
    }
    const kind = askCommentAnnotationKind("area_comment");
    if (!kind) return;
    createCommentAnnotation(point, comment, kind);
  }

  function handleAnnotationSelect(id: string | null) {
    setSelectedAnnotationId(id);
    if (tool !== "delete" || !id) return;

    const target = annotationsRef.current.find((a) => a.id === id);
    if (!target) return;
    const previous = annotationsRef.current;
    const next = previous.filter((a) => a.id !== id);
    replaceAnnotations(next);
    setSelectedAnnotationId(null);
    undoRef.current.push({
      label: "delete",
      undo: () => previous,
      redo: () => next,
    });
    syncUndoButtons();
    pendingSaves.current += 1;
    setSaveStatus("saving");
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await deleteAnnotationAction(
          id,
          submissionId,
          target.client_version,
        );
        if (result.error) {
          setSaveStatus("error");
          setSaveError(result.error);
          replaceAnnotations(previous);
          return;
        }
        setSaveStatus("saved");
      } finally {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      }
    });
  }

  function handleMoveLive(id: string, geometry: AnnotationGeometryPatch) {
    updateAnnotations((prev) =>
      prev.map((annotation) =>
        annotation.id === id ? { ...annotation, ...geometry } : annotation,
      ),
    );
  }

  function handleMoveEnd(id: string) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (!current) return;
    const next = {
      ...current,
      client_version: current.client_version + 1,
      updated_at: new Date().toISOString(),
    };
    updateAnnotations((prev) => prev.map((a) => (a.id === id ? next : a)));
    startTransition(() => {
      void persistAnnotation(next, null);
    });
  }

  function handleEditText(id: string, text: string) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (!current || current.text_content === text) return;
    const next = {
      ...current,
      text_content: text,
      client_version: current.client_version + 1,
      updated_at: new Date().toISOString(),
    };
    updateAnnotations((prev) => prev.map((a) => (a.id === id ? next : a)));
    startTransition(() => {
      void persistAnnotation(next, null);
    });
  }

  const handleFloatDragStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY };
      const origin = floatingPos;
      const workspace = workspaceRef.current;

      function onMove(ev: PointerEvent) {
        setFloatingPos(
          clampToolbarPos(
            {
              x: origin.x + ev.clientX - start.x,
              y: origin.y + ev.clientY - start.y,
            },
            workspace,
          ),
        );
      }

      function onUp(ev: PointerEvent) {
        if (target.hasPointerCapture(ev.pointerId)) {
          target.releasePointerCapture(ev.pointerId);
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [floatingPos],
  );

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
      if (e.key === "ArrowLeft") void goQuestion(-1);
      if (e.key === "ArrowRight") void goQuestion(1);
      if (e.key === "u") void goNextUnmarked();
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
  }, [
    selectedQuestionId,
    selectedMark,
    selectedBlock,
    circularThreshold,
    fullscreen,
  ]);

  const worksheetAnnotations = annotations.filter(
    (a) => a.target_kind === "worksheet" && !a.is_deleted,
  );
  const returnHref = `/teacher/marking/classes/${classId}/assignments/${assignmentId}${
    unmarkedOnly ? "?filter=unmarked" : ""
  }`;
  const saveLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "error"
        ? saveError ?? "Save failed"
        : saveStatus === "saved"
          ? "Saved"
          : "Ready";

  return (
    <div
      ref={workspaceRef}
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-slate-100"
          : "relative flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-slate-100 -mx-4 -my-6 sm:-mx-6 lg:-mx-8"
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
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
            {saveLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={returnHref}>
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

      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: toolbarDocked
            ? `${TOOLBAR_MIN_WIDTH}px minmax(${leftOpen ? NAV_MIN_WIDTH : 40}px, ${leftOpen ? leftWidth : 40}px) minmax(0, 1fr) minmax(${rightOpen ? RIGHT_MIN_WIDTH : 40}px, ${rightOpen ? rightWidth : 40}px)`
            : `minmax(${leftOpen ? NAV_MIN_WIDTH : 40}px, ${leftOpen ? leftWidth : 40}px) minmax(0, 1fr) minmax(${rightOpen ? RIGHT_MIN_WIDTH : 40}px, ${rightOpen ? rightWidth : 40}px)`,
        }}
      >
        {toolbarDocked ? (
          <AnnotationToolbar
            tool={tool}
            colour={colour}
            stamps={stamps}
            selectedStampId={selectedStampId}
            canUndo={canUndo}
            canRedo={canRedo}
            docked
            collapsed={toolbarCollapsed}
            floatingPos={floatingPos}
            onToolChange={setTool}
            onColourChange={setColour}
            onStampSelect={setSelectedStampId}
            onUndo={() => {
              const prev = undoRef.current.undo();
              if (prev) {
                replaceAnnotations(prev);
                syncUndoButtons();
              }
            }}
            onRedo={() => {
              const next = undoRef.current.redo();
              if (next) {
                replaceAnnotations(next);
                syncUndoButtons();
              }
            }}
            onToggleDock={() => setToolbarDocked(false)}
            onToggleCollapse={() => setToolbarCollapsed((v) => !v)}
            onFloatDragStart={handleFloatDragStart}
          />
        ) : null}

        {leftOpen ? (
          <aside
            className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-white"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-2 py-2">
              <div className="flex min-w-0 gap-1">
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
                title="Collapse navigation"
                aria-label="Collapse navigation"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setLeftOpen(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
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
                          <span className="block truncate font-medium">
                            Q{index + 1}. {block.content || block.prompt || "Question"}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {answered ? "Answered" : "Unanswered"} ·{" "}
                            {mark?.awarded_mark ?? "—"}/{block.max_marks ?? 0}
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
                  {!legacyFileName && !responses.some((r) => r.storage_path) ? (
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
            <div className="shrink-0 border-t border-slate-100 p-2 text-[11px] text-slate-500">
              Navigation width · {leftWidth}px
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
          <div className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-2">
            <button
              type="button"
              title="Expand navigation"
              aria-label="Expand navigation"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setLeftOpen(true)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFit("none");
                setZoom((z) => Math.max(0.5, z - 0.1));
              }}
            >
              Zoom -
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
              Question {selectedQuestionIndex >= 0 ? selectedQuestionIndex + 1 : "—"} of{" "}
              {questionIds.length} · {markTotals.markedCount} marked · Total{" "}
              {markTotals.awarded}/{maximumMark}
            </span>
          </div>

          {centreView.kind === "file" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <FileViewer
                fileName={centreView.fileName}
                storagePath={centreView.path}
                bucket={centreView.bucket}
                zoom={zoom}
                fit={fit}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto bg-slate-300/50 p-6">
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
                  annotations={worksheetAnnotations}
                  tool={tool}
                  colour={colour}
                  selectedId={selectedAnnotationId}
                  stamps={stamps}
                  stampSizePct={
                    stamps.find((s) => s.id === selectedStampId)?.default_size_pct ??
                    8
                  }
                  onSelect={handleAnnotationSelect}
                  onCreate={createAnnotation}
                  onMoveLive={handleMoveLive}
                  onMoveEnd={handleMoveEnd}
                  onEditText={handleEditText}
                  onCommentDrop={handleCommentDrop}
                />
              </div>
            </div>
          )}
        </main>

        {rightOpen ? (
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Marking
              </p>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setRightOpen(false)}
              >
                Collapse
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
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
                    onPrev={() => void goQuestion(-1)}
                    onNext={() => void goQuestion(1)}
                    onNextUnmarked={() => void goNextUnmarked()}
                  />
                ) : (
                  <p className="text-sm text-slate-500">No assessable questions.</p>
                )}
              </Card>

              <Card className="space-y-2 p-3 shadow-none">
                <CardTitle className="text-sm">Student answer</CardTitle>
                <StudentAnswerSummary
                  response={selectedResponse}
                  onOpenFile={(fileName, storagePath) =>
                    setCentreView({
                      kind: "file",
                      fileName,
                      path: storagePath,
                      bucket: "student-submissions",
                    })
                  }
                />
              </Card>

              <Card className="space-y-3 p-3 shadow-none">
                <CardTitle className="text-sm">Linked comments</CardTitle>
                <LinkedCommentsPanel
                  selectedQuestionId={selectedQuestionId}
                  assignmentComments={assignmentComments}
                  commentBankItems={commentBankItems}
                  onInsertIntoFeedback={appendCommentToFeedback}
                  onClickInsertAnnotation={handleClickInsertAnnotation}
                />
                {commentBanks.length ? (
                  <p className="text-[11px] text-slate-400">
                    Linked banks: {commentBanks.map((b) => b.name).join(", ")}
                  </p>
                ) : null}
              </Card>

              {selectedBlock?.mark_scheme_note || selectedBlock?.teacher_note ? (
                <Card className="space-y-2 p-3 shadow-none">
                  <CardTitle className="text-sm">Teacher guidance</CardTitle>
                  {selectedBlock.mark_scheme_note ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-2 text-xs text-amber-950">
                      <p className="mb-1 font-semibold">Mark-scheme note</p>
                      <p className="whitespace-pre-wrap">
                        {selectedBlock.mark_scheme_note}
                      </p>
                    </div>
                  ) : null}
                  {selectedBlock.teacher_note ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                      <p className="mb-1 font-semibold">Teacher note</p>
                      <p className="whitespace-pre-wrap">
                        {selectedBlock.teacher_note}
                      </p>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {markSchemes.length ? (
                <Card className="space-y-2 p-3 shadow-none">
                  <CardTitle className="text-sm">Mark schemes</CardTitle>
                  <div className="space-y-1">
                    {markSchemes.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="w-full rounded-xl border border-slate-100 px-2 py-2 text-left text-xs hover:bg-slate-50"
                        onClick={() =>
                          setCentreView({
                            kind: "file",
                            fileName: file.file_name,
                            path: file.storage_path,
                            bucket: "assignment-resources",
                          })
                        }
                      >
                        <span className="block font-medium text-slate-800">
                          {file.title || file.file_name}
                        </span>
                        {file.title ? (
                          <span className="block text-slate-500">{file.file_name}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}

              {feedbackFields.length > 0 ? (
                <details className="rounded-2xl border border-slate-100 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Additional assignment feedback
                  </summary>
                  <div className="mt-3">
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
                  </div>
                </details>
              ) : null}

              <p className="text-xs text-slate-500">
                Progress: {completion.answeredAssessableCount}/
                {completion.assessableCount} answered ·{" "}
                {markTotals.markedCount}/{questionIds.length} marked ·{" "}
                {formatMarkLabel(markTotals.awarded)} awarded
              </p>

              <Card className="space-y-2 p-3 shadow-none">
                <CardTitle className="text-sm">Teacher-only note</CardTitle>
                <Textarea
                  value={selectedMark?.teacher_only_note ?? ""}
                  onChange={(e) => updateMark({ teacher_only_note: e.target.value })}
                  placeholder="Private note for teachers"
                  className="min-h-24"
                />
              </Card>
            </div>
            <div className="shrink-0 border-t border-slate-100 p-2 text-[11px] text-slate-500">
              Marking panel width · {rightWidth}px
              <input
                type="range"
                min={300}
                max={520}
                value={rightWidth}
                onChange={(e) => setRightWidth(Number(e.target.value))}
                className="mt-1 w-full"
                aria-label="Resize right pane"
              />
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="flex w-10 min-w-10 shrink-0 items-start justify-center border-l border-slate-200 bg-white py-2 text-xs"
            onClick={() => setRightOpen(true)}
            title="Expand marking panel"
            aria-label="Expand marking panel"
          >
            ««
          </button>
        )}
      </div>

      {!toolbarDocked ? (
        <AnnotationToolbar
          tool={tool}
          colour={colour}
          stamps={stamps}
          selectedStampId={selectedStampId}
          canUndo={canUndo}
          canRedo={canRedo}
          docked={false}
          collapsed={toolbarCollapsed}
          floatingPos={floatingPos}
          onToolChange={setTool}
          onColourChange={setColour}
          onStampSelect={setSelectedStampId}
          onUndo={() => {
            const prev = undoRef.current.undo();
            if (prev) {
              replaceAnnotations(prev);
              syncUndoButtons();
            }
          }}
          onRedo={() => {
            const next = undoRef.current.redo();
            if (next) {
              replaceAnnotations(next);
              syncUndoButtons();
            }
          }}
          onToggleDock={() => setToolbarDocked(true)}
          onToggleCollapse={() => setToolbarCollapsed((v) => !v)}
          onFloatDragStart={handleFloatDragStart}
        />
      ) : null}
    </div>
  );
}

function StudentAnswerSummary({
  response,
  onOpenFile,
}: {
  response?: MarkingResponse;
  onOpenFile: (fileName: string, storagePath: string) => void;
}) {
  const json = formatJsonValue(response?.json_value);
  const hasText = Boolean(response?.text_value?.trim());
  const hasNumeric = response?.numeric_value != null;
  const hasBoolean = response?.boolean_value != null;
  const hasJson = Boolean(json);
  const hasFile = Boolean(response?.file_name && response.storage_path);
  const filledCells =
    response?.cells?.filter(
      (cell) =>
        Boolean(cell.text_value?.trim()) ||
        cell.numeric_value != null ||
        cell.boolean_value != null,
    ).length ?? 0;

  if (!response || (!hasText && !hasNumeric && !hasBoolean && !hasJson && !hasFile && !filledCells)) {
    return <p className="text-xs text-slate-500">No response recorded.</p>;
  }

  return (
    <div className="space-y-2 text-xs text-slate-700">
      {hasText ? (
        <div>
          <p className="font-semibold text-slate-500">Text</p>
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-2">
            {response.text_value}
          </p>
        </div>
      ) : null}
      {hasNumeric ? (
        <p>
          <span className="font-semibold text-slate-500">Numeric: </span>
          {response.numeric_value}
        </p>
      ) : null}
      {hasBoolean ? (
        <p>
          <span className="font-semibold text-slate-500">Boolean: </span>
          {String(response.boolean_value)}
        </p>
      ) : null}
      {hasJson ? (
        <div>
          <p className="font-semibold text-slate-500">Structured / JSON</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-2 font-sans">
            {json}
          </pre>
        </div>
      ) : null}
      {filledCells ? (
        <p>
          <span className="font-semibold text-slate-500">Table cells: </span>
          {filledCells} completed
        </p>
      ) : null}
      {hasFile && response.file_name && response.storage_path ? (
        <button
          type="button"
          className="w-full rounded-xl border border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
          onClick={() => onOpenFile(response.file_name!, response.storage_path!)}
        >
          <span className="block font-semibold text-slate-500">File</span>
          <span className="text-slate-800">{response.file_name}</span>
        </button>
      ) : null}
    </div>
  );
}
