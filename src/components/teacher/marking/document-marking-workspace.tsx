"use client";

import {
  memo,
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
import {
  StructuredWorksheetRenderer,
  buildValuesFromResponses,
} from "@/components/shared/structured-worksheet-renderer";
import { prefetchStampUrls } from "@/components/shared/stamp-image";
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
import {
  normalizeStampDimensions,
  speechBubbleBox,
} from "@/lib/marking/annotation-geometry";
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
> & {
  geometry?: Record<string, unknown>;
  text_content?: string | null;
  colour?: string;
  opacity?: number;
};

type CommentPayload = { id: string; text: string };

const TOOLBAR_DOCKED_KEY = "marking:toolbar-docked";
const TOOLBAR_COLLAPSED_KEY = "marking:toolbar-collapsed";
const TOOLBAR_POS_KEY = "marking:toolbar-pos";
const RIGHT_WIDTH_KEY = "marking:right-panel-width";
const DEFAULT_FLOATING_POS = { x: 56, y: 72 };
const DEFAULT_COMMENT_BOX = { w: 0.24, h: 0.09 };
const TOOLBAR_MIN_WIDTH = 56;
const NAV_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 280;
const RIGHT_MAX_WIDTH = 520;
const RIGHT_DEFAULT_WIDTH = 360;

const MemoWorksheet = memo(StructuredWorksheetRenderer);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredRightWidth() {
  if (typeof window === "undefined") return RIGHT_DEFAULT_WIDTH;
  const raw = Number(window.localStorage.getItem(RIGHT_WIDTH_KEY));
  if (!Number.isFinite(raw)) return RIGHT_DEFAULT_WIDTH;
  return clamp(raw, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH);
}

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

function askCommentAnnotationKind(
  fallback: "area_comment" | "text_comment" = "area_comment",
) {
  const raw = window.prompt(
    "Create as box or bubble comment?",
    fallback === "text_comment" ? "bubble" : "box",
  );
  if (raw == null) return null;
  return raw.trim().toLowerCase() === "bubble" ? "text_comment" : "area_comment";
}

function normalizeLoadedAnnotations(
  rows: SubmissionAnnotation[],
): { annotations: SubmissionAnnotation[]; changed: SubmissionAnnotation[] } {
  const changed: SubmissionAnnotation[] = [];
  const annotations = rows.map((row) => {
    const next = normalizeStampDimensions(row);
    if (!next) return row;
    const updated = {
      ...row,
      w_norm: next.w_norm,
      h_norm: next.h_norm,
      geometry: next.geometry,
    };
    changed.push(updated);
    return updated;
  });
  return { annotations, changed };
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
  void feedback;
  void feedbackFields;
  void feedbackFieldValues;
  void commentBanks;

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
  const [rightWidth, setRightWidth] = useState(readStoredRightWidth);
  const [centreView, setCentreView] = useState<CentreView>({ kind: "worksheet" });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<"none" | "width" | "page">("width");
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [colour, setColour] = useState("#dc2626");
  const [selectedStampId, setSelectedStampId] = useState<string | null>(
    stamps[0]?.id ?? null,
  );
  const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>(() => {
    const { annotations: normalised } =
      normalizeLoadedAnnotations(initialAnnotations);
    return normalised;
  });
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    null,
  );
  const [stampsReady, setStampsReady] = useState(false);
  const stampNormalizeSaved = useRef(false);
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
  const annotationsRef = useRef(annotations);

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
    window.localStorage.setItem(RIGHT_WIDTH_KEY, String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    function clampToWorkspace() {
      setFloatingPos((prev) => clampToolbarPos(prev, workspaceRef.current));
    }
    clampToWorkspace();
    window.addEventListener("resize", clampToWorkspace);
    return () => window.removeEventListener("resize", clampToWorkspace);
  }, [fullscreen, toolbarDocked]);

  useEffect(() => {
    let cancelled = false;
    const paths = stamps.map((s) => s.storage_path);
    void prefetchStampUrls(paths).finally(() => {
      if (!cancelled) setStampsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [stamps]);

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const current = annotationsRef.current.find(
      (a) => a.id === selectedAnnotationId,
    );
    if (!current || current.annotation_type !== "text_highlight") return;
    if (current.colour === colour) return;
    handleCommitGeometry(current.id, {
      x_norm: current.x_norm,
      y_norm: current.y_norm,
      w_norm: current.w_norm,
      h_norm: current.h_norm,
      colour,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply toolbar colour to selected highlight only
  }, [colour]);

  useEffect(() => {
    if (stampNormalizeSaved.current) return;
    const { changed } = normalizeLoadedAnnotations(initialAnnotations);
    if (!changed.length) {
      stampNormalizeSaved.current = true;
      return;
    }
    stampNormalizeSaved.current = true;
    for (const row of changed) {
      void persistAnnotation(
        {
          ...row,
          client_version: row.client_version + 1,
          updated_at: new Date().toISOString(),
        },
        null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time migrate of legacy stamp boxes
  }, [initialAnnotations]);

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
      // Keep local geometry to avoid a post-save jump; only sync server identity.
      updateAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== next.id && a.id !== result.annotation!.id) return a;
          return {
            ...a,
            id: result.annotation!.id,
            client_version: result.annotation!.client_version,
            created_by: result.annotation!.created_by || a.created_by,
            created_at: result.annotation!.created_at || a.created_at,
            updated_at: result.annotation!.updated_at || a.updated_at,
          };
        }),
      );
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
        geometry: {
          collapsed: false,
          tail_edge: "bottom",
          tail_offset: 0.5,
          tail_length: 0.35,
        },
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
      geometry: { collapsed: false },
    });
  }

  function handleCommentDrop(point: { x: number; y: number }, comment: CommentPayload) {
    if (tool === "area_comment" || tool === "text_comment") {
      createCommentAnnotation(point, comment, tool);
      return;
    }
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

  function deleteAnnotationById(id: string) {
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

  function handleAnnotationSelect(id: string | null) {
    setSelectedAnnotationId(id);
    if (tool !== "delete" || !id) return;
    deleteAnnotationById(id);
  }

  function handleCommitGeometry(id: string, patch: AnnotationGeometryPatch) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (!current) return;
    const previous = annotationsRef.current;
    const next: SubmissionAnnotation = {
      ...current,
      x_norm: patch.x_norm,
      y_norm: patch.y_norm,
      w_norm: patch.w_norm,
      h_norm: patch.h_norm,
      geometry: patch.geometry ?? current.geometry,
      text_content:
        patch.text_content !== undefined
          ? patch.text_content
          : current.text_content,
      colour: patch.colour ?? current.colour,
      opacity: patch.opacity ?? current.opacity,
      client_version: current.client_version + 1,
      updated_at: new Date().toISOString(),
    };
    const unchanged =
      current.x_norm === next.x_norm &&
      current.y_norm === next.y_norm &&
      current.w_norm === next.w_norm &&
      current.h_norm === next.h_norm &&
      JSON.stringify(current.geometry) === JSON.stringify(next.geometry);
    if (unchanged) return;

    const redoState = previous.map((a) => (a.id === id ? next : a));
    updateAnnotations(() => redoState);
    undoRef.current.push({
      label: "move",
      undo: () => previous,
      redo: () => redoState,
    });
    syncUndoButtons();
    startTransition(() => {
      void persistAnnotation(next, previous);
    });
  }

  function handleToggleCollapse(id: string) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (!current) return;
    const collapsed = current.geometry?.collapsed === true;
    handleCommitGeometry(id, {
      x_norm: current.x_norm,
      y_norm: current.y_norm,
      w_norm: current.w_norm,
      h_norm: current.h_norm,
      geometry: { ...current.geometry, collapsed: !collapsed },
    });
  }

  function handleEditText(id: string, text: string) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (!current || current.text_content === text) return;
    const previous = annotationsRef.current;
    const next = {
      ...current,
      text_content: text,
      client_version: current.client_version + 1,
      updated_at: new Date().toISOString(),
    };
    updateAnnotations((prev) => prev.map((a) => (a.id === id ? next : a)));
    startTransition(() => {
      void persistAnnotation(next, previous);
    });
  }

  function beginRightResize(e: ReactPointerEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = rightWidth;

    function onMove(ev: PointerEvent) {
      const delta = startX - ev.clientX;
      setRightWidth(clamp(startWidth + delta, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH));
    }
    function onUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

  const onSelectQuestion = useCallback((qid: string) => {
    setSelectedQuestionId(qid);
  }, []);

  const worksheetAnnotations = annotations.filter(
    (a) => a.target_kind === "worksheet" && !a.is_deleted,
  );
  const returnHref = `/teacher/marking/classes/${classId}/assignments/${assignmentId}${
    unmarkedOnly ? "?filter=unmarked" : ""
  }`;
  const saveLabel =
    saveStatus === "saving"
      ? "Saving"
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
                <MemoWorksheet
                  sections={sections}
                  values={worksheetValues}
                  mode="teacher_marking"
                  showTeacherGuidance
                  selectedQuestionId={selectedQuestionId}
                  onSelectQuestion={onSelectQuestion}
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
                  onCommitGeometry={handleCommitGeometry}
                  onEditText={handleEditText}
                  onToggleCollapse={handleToggleCollapse}
                  onDeleteSelected={(id) => {
                    const targetId = id ?? selectedAnnotationId;
                    if (targetId) deleteAnnotationById(targetId);
                  }}
                  onCommentDrop={handleCommentDrop}
                />
                {!stampsReady ? (
                  <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-slate-900/70 px-2 py-1 text-[11px] text-white">
                    Loading stamps…
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </main>

        {rightOpen ? (
          <aside className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
            <button
              type="button"
              aria-label="Resize marking panel"
              title="Drag to resize panel"
              className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70"
              onPointerDown={beginRightResize}
              onDoubleClick={() => setRightWidth(RIGHT_DEFAULT_WIDTH)}
            />
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2 pl-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Marking
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] text-slate-400 hover:text-slate-700"
                  title="Reset panel width"
                  onClick={() => setRightWidth(RIGHT_DEFAULT_WIDTH)}
                >
                  Reset width
                </button>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-800"
                  onClick={() => setRightOpen(false)}
                >
                  Collapse
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 pl-4">
              <section className="space-y-3">
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
              </section>

              <section className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Linked comments
                </p>
                <LinkedCommentsPanel
                  selectedQuestionId={selectedQuestionId}
                  assignmentComments={assignmentComments}
                  commentBankItems={commentBankItems}
                  onInsertIntoFeedback={appendCommentToFeedback}
                  onClickInsertAnnotation={handleClickInsertAnnotation}
                />
              </section>

              {(selectedBlock?.mark_scheme_note || markSchemes.length > 0) && (
                <details className="border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Mark scheme
                  </summary>
                  <div className="mt-2 space-y-2">
                    {selectedBlock?.mark_scheme_note ? (
                      <p className="whitespace-pre-wrap">
                        {selectedBlock.mark_scheme_note}
                      </p>
                    ) : null}
                    {markSchemes.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="block w-full text-left text-slate-700 underline-offset-2 hover:underline"
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
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              {markTotals.markedCount}/{questionIds.length} marked ·{" "}
              {formatMarkLabel(markTotals.awarded)}/{maximumMark} ·{" "}
              {completion.answeredAssessableCount}/{completion.assessableCount}{" "}
              answered
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

