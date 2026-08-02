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
import {
  MarkAwardFlash,
  type MarkFlashPayload,
} from "@/components/teacher/marking/mark-award-flash";
import { QuestionMarkControls } from "@/components/teacher/marking/question-mark-controls";
import { VerticalMarkStrip } from "@/components/teacher/marking/vertical-mark-strip";
import {
  deleteAnnotationAction,
  saveAnnotationAction,
  saveQuestionMarkAction,
} from "@/lib/actions/marking-annotations";
import { releaseSubmissionFeedbackAction } from "@/lib/actions/feedback-release";
import {
  evaluateStructuredCompletion,
  type ResponseSnapshot,
} from "@/lib/homework/completion";
import { formatMarkLabel } from "@/lib/homework/marks";
import {
  expandAssessableBlocks,
  parentScannedUploadBlockId,
} from "@/lib/marking/expand-assessable";
import type { ScannedUploadFileRow } from "@/lib/actions/scanned-uploads";
import type {
  AssignmentFeedbackField,
  CommentBankItem,
  FeedbackFieldValue,
} from "@/lib/feedback/types";
import { normalizeStampDimensions } from "@/lib/marking/annotation-geometry";
import { appendFeedbackAvoidingDuplicate } from "@/lib/marking/box-comment-size";
import type {
  AnnotationTool,
  MarkingStamp,
  QuestionMarkRecord,
  SubmissionAnnotation,
} from "@/lib/marking/annotation-types";
import {
  deriveMarkingStatus,
  formatQuestionMarkProgress,
  inferMarkingMode,
  isQuestionMarkingComplete,
  listIncompleteQuestionLabels,
  sumAwardedMarks,
} from "@/lib/marking/question-marks";
import {
  QUESTION_FEEDBACK_DEBOUNCE_MS,
  mergeServerMarkIfFresh,
} from "@/lib/marking/question-mark-sync";
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
      /** When true, annotation layer overlays the file (student script). */
      annotatable?: boolean;
      pageNumber?: number | null;
      rotation?: number;
      originalPath?: string | null;
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

const TOOLBAR_DOCKED_KEY = "marking:toolbar-docked";
const TOOLBAR_COLLAPSED_KEY = "marking:toolbar-collapsed";
const TOOLBAR_POS_KEY = "marking:toolbar-pos";
const RIGHT_WIDTH_KEY = "marking:right-panel-width";
const LEFT_WIDTH_KEY = "marking:left-nav-width";
const DEFAULT_FLOATING_POS = { x: 56, y: 72 };
const TOOLBAR_MIN_WIDTH = 56;
const LEFT_MIN_WIDTH = 180;
const LEFT_DEFAULT_WIDTH = 240;
const LEFT_MAX_WIDTH = 420;
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

function readStoredLeftWidth() {
  if (typeof window === "undefined") return LEFT_DEFAULT_WIDTH;
  const raw = Number(window.localStorage.getItem(LEFT_WIDTH_KEY));
  if (!Number.isFinite(raw)) return LEFT_DEFAULT_WIDTH;
  return clamp(raw, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH);
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
  initialScannedFiles = [],
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
  initialScannedFiles?: ScannedUploadFileRow[];
}) {
  void annotationDefaultVisibility;
  void feedbackFields;
  void feedbackFieldValues;
  void commentBanks;

  const assessable = useMemo(
    () => expandAssessableBlocks(sections),
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
  const [leftWidth, setLeftWidth] = useState(readStoredLeftWidth);
  const [rightWidth, setRightWidth] = useState(readStoredRightWidth);
  const [centreView, setCentreView] = useState<CentreView>({ kind: "worksheet" });
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<"none" | "width" | "page">("width");
  const [tool, setToolRaw] = useState<AnnotationTool>("select");
  const setTool = useCallback((next: AnnotationTool) => {
    // Speech-bubble tool removed from the workflow.
    setToolRaw(next === "text_comment" ? "area_comment" : next);
  }, []);
  const [colour, setColour] = useState("#dc2626");
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [paletteStampDragId, setPaletteStampDragId] = useState<string | null>(
    null,
  );
  const [readyStampPaths, setReadyStampPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>(() => {
    const { annotations: normalised } =
      normalizeLoadedAnnotations(initialAnnotations);
    return normalised;
  });
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    null,
  );
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null,
  );
  const [markFlash, setMarkFlash] = useState<MarkFlashPayload | null>(null);
  const textEditTimers = useRef(new Map<string, number>());
  const editSnapshots = useRef(new Map<string, SubmissionAnnotation>());
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
  const questionMarksRef = useRef(questionMarks);
  questionMarksRef.current = questionMarks;
  const markMutationSeq = useRef(0);
  const latestMarkMutation = useRef(new Map<string, number>());
  const feedbackDebounceTimers = useRef(new Map<string, number>());
  const pendingMarkDrafts = useRef(new Map<string, QuestionMarkRecord>());
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [feedbackReleasedAt, setFeedbackReleasedAt] = useState<string | null>(
    feedback?.released_at ?? null,
  );

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

  const scannedFilesByBlock = useMemo(() => {
    const map = new Map<string, ScannedUploadFileRow[]>();
    for (const file of initialScannedFiles) {
      const list = map.get(file.block_id) ?? [];
      list.push(file);
      map.set(file.block_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.display_order - b.display_order);
    }
    return map;
  }, [initialScannedFiles]);

  const openScannedBlock = useCallback(
    (blockId: string) => {
      const files = scannedFilesByBlock.get(blockId) ?? [];
      if (!files.length) {
        setCentreView({ kind: "worksheet" });
        return;
      }
      const combinedPreview = files.find(
        (f) =>
          f.preview_storage_path &&
          f.preview_storage_path !== f.original_storage_path &&
          f.preview_storage_path.endsWith(".pdf"),
      );
      if (combinedPreview?.preview_storage_path) {
        setCentreView({
          kind: "file",
          fileName: "Marking preview.pdf",
          path: combinedPreview.preview_storage_path,
          bucket: "student-submissions",
          annotatable: true,
          pageNumber: 1,
          originalPath: combinedPreview.original_storage_path,
        });
        return;
      }
      const first = files[0]!;
      setCentreView({
        kind: "file",
        fileName: first.original_file_name,
        path: first.preview_storage_path || first.original_storage_path,
        bucket: "student-submissions",
        annotatable: true,
        pageNumber: 1,
        rotation: first.rotation,
        originalPath: first.original_storage_path,
      });
    },
    [scannedFilesByBlock],
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
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingSaves.current > 0 || feedbackDebounceTimers.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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
    window.localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth));
  }, [leftWidth]);

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
    void prefetchStampUrls(paths).then((readyPaths) => {
      if (cancelled) return;
      setReadyStampPaths(new Set(readyPaths));
      setStampsReady(true);
      const firstReady = stamps.find(
        (s) => s.storage_path && readyPaths.includes(s.storage_path),
      );
      setSelectedStampId((prev) => {
        if (prev && stamps.some((s) => s.id === prev)) return prev;
        return firstReady?.id ?? null;
      });
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
    // Flush debounced question-feedback saves immediately.
    for (const [qid, timer] of feedbackDebounceTimers.current.entries()) {
      window.clearTimeout(timer);
      feedbackDebounceTimers.current.delete(qid);
      window.dispatchEvent(
        new CustomEvent("marking:flush-question-mark", { detail: { questionId: qid } }),
      );
    }
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

  const annotationSaveSeq = useRef(0);
  const annotationSaveLatest = useRef(new Map<string, number>());

  async function persistAnnotation(
    next: SubmissionAnnotation,
    previous: SubmissionAnnotation[] | null,
    options?: { rollbackOnFailure?: boolean },
  ) {
    const seq = ++annotationSaveSeq.current;
    annotationSaveLatest.current.set(next.id, seq);
    pendingSaves.current += 1;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const result = await saveAnnotationAction({
        ...next,
        submission_id: submissionId,
        assignment_id: assignmentId,
      });
      // Ignore stale responses from earlier saves of the same annotation.
      if (annotationSaveLatest.current.get(next.id) !== seq) {
        return;
      }
      if (result.error || !result.annotation) {
        setSaveStatus("error");
        setSaveError(result.error ?? "Save failed");
        // Keep the optimistic geometry; only roll back when explicitly requested
        // (e.g. failed create). Failed moves keep the local position.
        if (options?.rollbackOnFailure && previous) {
          replaceAnnotations(previous);
        }
        return;
      }
      const serverId = result.annotation.id;
      // Keep local geometry to avoid a post-save jump; only sync server identity.
      updateAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== next.id && a.id !== serverId) return a;
          // Never overwrite newer local geometry with an older save response.
          const localNewer =
            a.client_version > result.annotation!.client_version ||
            a.updated_at > (result.annotation!.updated_at ?? "");
          if (localNewer && a.id === serverId) {
            return {
              ...a,
              client_version: Math.max(
                a.client_version,
                result.annotation!.client_version,
              ),
              created_by: result.annotation!.created_by || a.created_by,
              created_at: result.annotation!.created_at || a.created_at,
            };
          }
          return {
            ...a,
            id: serverId,
            client_version: result.annotation!.client_version,
            created_by: result.annotation!.created_by || a.created_by,
            created_at: result.annotation!.created_at || a.created_at,
            updated_at: result.annotation!.updated_at || a.updated_at,
          };
        }),
      );
      if (serverId !== next.id) {
        setSelectedAnnotationId((cur) => (cur === next.id ? serverId : cur));
        setEditingAnnotationId((cur) => (cur === next.id ? serverId : cur));
        const snap = editSnapshots.current.get(next.id);
        if (snap) {
          editSnapshots.current.delete(next.id);
          editSnapshots.current.set(serverId, { ...snap, id: serverId });
        }
        annotationSaveLatest.current.set(
          serverId,
          annotationSaveLatest.current.get(next.id) ?? seq,
        );
      }
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
    stamp_definition_id?: string | null;
    begin_inline_edit?: boolean;
  }) {
    const previous = annotationsRef.current;
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stampId =
      draft.stamp_definition_id ??
      (draft.annotation_type === "stamp" ? selectedStampId : null);
    const parentBlockId =
      parentScannedUploadBlockId(selectedBlock) ?? selectedBlock?._id ?? null;
    const created: SubmissionAnnotation = {
      id: tempId,
      submission_id: submissionId,
      assignment_id: assignmentId,
      question_id: selectedQuestionId,
      block_id: parentBlockId,
      page_number:
        centreView.kind === "file" ? (centreView.pageNumber ?? 1) : null,
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
      opacity:
        draft.annotation_type === "freehand"
          ? 0.55
          : draft.annotation_type === "stamp"
            ? typeof draft.geometry?.opacity === "number"
              ? Number(draft.geometry.opacity)
              : 1
            : 0.35,
      stroke_width: 2,
      stamp_id: stampId,
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
    setSelectedAnnotationId(tempId);
    if (draft.begin_inline_edit) {
      editSnapshots.current.set(tempId, { ...created });
      setEditingAnnotationId(tempId);
    }
    undoRef.current.push({
      label: "add",
      undo: () => previous,
      redo: () => next,
    });
    syncUndoButtons();
    startTransition(() => {
      void persistAnnotation(created, previous, { rollbackOnFailure: true });
    });
  }

  function persistQuestionMark(next: QuestionMarkRecord, mutationId: number) {
    pendingSaves.current += 1;
    setSaveStatus("saving");
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await saveQuestionMarkAction(next);
        const latest = latestMarkMutation.current.get(next.question_id) ?? 0;
        if (result.error) {
          // Keep local draft — never roll feedback back to empty on failure.
          if (latest === mutationId) {
            setSaveStatus("error");
            setSaveError(result.error);
          }
          return;
        }
        if (result.mark) {
          setQuestionMarks((prev) => {
            const local = prev.find((m) => m.question_id === result.mark!.question_id);
            const merged = mergeServerMarkIfFresh(
              local,
              result.mark!,
              latestMarkMutation.current.get(result.mark!.question_id) ?? 0,
              mutationId,
            );
            const others = prev.filter(
              (m) => m.question_id !== result.mark!.question_id,
            );
            return [...others, merged];
          });
        }
        if (latest === mutationId) setSaveStatus("saved");
      } finally {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      }
    });
  }

  function updateMark(
    patch: Partial<QuestionMarkRecord>,
    options?: { debounceMs?: number; questionId?: string },
  ) {
    const qid = options?.questionId ?? selectedQuestionId;
    if (!qid) return;
    const block =
      assessable.find((b) => b.question_id === qid) ?? selectedBlock;
    if (!block) return;
    const mode = inferMarkingMode(block);
    const existing =
      pendingMarkDrafts.current.get(qid) ??
      questionMarksRef.current.find((m) => m.question_id === qid);
    const next: QuestionMarkRecord = {
      submission_id: submissionId,
      question_id: qid,
      marking_mode: mode,
      awarded_mark: existing?.awarded_mark ?? null,
      maximum_mark: Number(block.max_marks ?? 0),
      review_state: existing?.review_state ?? null,
      not_attempted: existing?.not_attempted ?? false,
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

    // Selecting a numeric mark clears NA; selecting NA clears the numeric mark.
    if (patch.not_attempted === true) {
      next.not_attempted = true;
      next.awarded_mark = 0;
      next.review_state = "not_attempted";
    } else if (patch.awarded_mark != null || patch.not_attempted === false) {
      next.not_attempted = false;
      if (next.review_state === "not_attempted") next.review_state = null;
    }

    next.marking_status = deriveMarkingStatus({
      mode: next.marking_mode,
      awardedMark: next.awarded_mark,
      reviewState: next.review_state,
      feedback: next.question_feedback,
      flagged: next.flagged,
      notAttempted: next.not_attempted,
    });

    const mutationId = ++markMutationSeq.current;
    latestMarkMutation.current.set(qid, mutationId);
    pendingMarkDrafts.current.set(qid, next);

    setQuestionMarks((prev) => {
      const others = prev.filter((m) => m.question_id !== qid);
      return [...others, next];
    });

    if (
      patch.not_attempted === true &&
      !existing?.not_attempted &&
      (mode === "numeric" || mode === "auto_mcq" || mode === "reviewed")
    ) {
      setMarkFlash({ value: "NA", token: Date.now() });
    } else if (
      patch.awarded_mark != null &&
      (patch.awarded_mark !== existing?.awarded_mark || existing?.not_attempted) &&
      (mode === "numeric" || mode === "auto_mcq")
    ) {
      setMarkFlash({
        value: patch.awarded_mark,
        token: Date.now(),
      });
    }

    const debounceMs = options?.debounceMs ?? 0;
    const existingTimer = feedbackDebounceTimers.current.get(qid);
    if (existingTimer) window.clearTimeout(existingTimer);

    if (debounceMs > 0) {
      const timer = window.setTimeout(() => {
        feedbackDebounceTimers.current.delete(qid);
        const draft = pendingMarkDrafts.current.get(qid) ?? next;
        const id = latestMarkMutation.current.get(qid) ?? mutationId;
        persistQuestionMark(draft, id);
      }, debounceMs);
      feedbackDebounceTimers.current.set(qid, timer);
      return;
    }

    persistQuestionMark(next, mutationId);
  }

  useEffect(() => {
    function onFlush(ev: Event) {
      const qid = (ev as CustomEvent<{ questionId: string }>).detail?.questionId;
      if (!qid) return;
      const current = questionMarksRef.current.find((m) => m.question_id === qid);
      if (!current) return;
      const mutationId = latestMarkMutation.current.get(qid) ?? ++markMutationSeq.current;
      latestMarkMutation.current.set(qid, mutationId);
      persistQuestionMark(current, mutationId);
    }
    window.addEventListener("marking:flush-question-mark", onFlush);
    return () => window.removeEventListener("marking:flush-question-mark", onFlush);
  }, [submissionId]);

  async function goQuestion(direction: -1 | 1) {
    if (!questionIds.length) return;
    await flushPending();
    const idx = selectedQuestionId
      ? questionIds.indexOf(selectedQuestionId)
      : 0;
    const next =
      questionIds[Math.min(questionIds.length - 1, Math.max(0, idx + direction))];
    if (!next) return;
    setSelectedQuestionId(next);
    const block = assessable.find((b) => b.question_id === next);
    if (block?.block_type === "scanned_homework_upload") {
      const parentId = parentScannedUploadBlockId(block);
      if (parentId) openScannedBlock(parentId);
    } else {
      setCentreView({ kind: "worksheet" });
    }
  }

  function appendCommentToFeedback(text: string) {
    if (!selectedQuestionId) return;
    const existing = questionMarksRef.current.find(
      (m) => m.question_id === selectedQuestionId,
    );
    updateMark(
      {
        question_feedback: appendFeedbackAvoidingDuplicate(
          existing?.question_feedback,
          text,
        ),
      },
      { debounceMs: QUESTION_FEEDBACK_DEBOUNCE_MS },
    );
  }

  async function handleReleaseFeedback() {
    const labels = new Map(
      assessable.map((b, index) => [
        b.question_id!,
        `Q${index + 1}. ${b.content || b.prompt || "Question"}`,
      ]),
    );
    const incomplete = listIncompleteQuestionLabels(
      questionIds,
      labels,
      marksByQuestion,
    );
    if (incomplete.length) {
      window.alert(
        `Marking incomplete. Finish these questions before release:\n\n${incomplete
          .slice(0, 12)
          .join("\n")}${incomplete.length > 12 ? "\n…" : ""}`,
      );
      return;
    }
    const ok = window.confirm(
      feedbackReleasedAt
        ? "Re-release feedback to the student? They will see the latest marks, question feedback and annotations."
        : "Release feedback to the student? They will see marks, question feedback and annotations.",
    );
    if (!ok) return;
    setReleaseBusy(true);
    try {
      const flushed = await flushPending();
      if (!flushed) return;
      const labelsObj = Object.fromEntries(labels);
      const result = await releaseSubmissionFeedbackAction(submissionId, {
        questionIds,
        labelsByQuestion: labelsObj,
      });
      if (result.error) {
        setSaveStatus("error");
        setSaveError(
          result.incomplete?.length
            ? `${result.error}: ${result.incomplete.slice(0, 6).join("; ")}`
            : result.error,
        );
        return;
      }
      setFeedbackReleasedAt(result.releasedAt ?? new Date().toISOString());
      setSaveStatus("saved");
      setSaveError(null);
    } finally {
      setReleaseBusy(false);
    }
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
      current.text_content === next.text_content &&
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
    // Persist after pointer-up only — never during drag.
    startTransition(() => {
      void persistAnnotation(next, previous, { rollbackOnFailure: false });
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

  function handleBeginInlineEdit(id: string) {
    const current = annotationsRef.current.find((a) => a.id === id);
    if (current) editSnapshots.current.set(id, { ...current });
    setSelectedAnnotationId(id);
    setEditingAnnotationId(id);
  }

  function handleEndInlineEdit(id: string, cancel?: boolean) {
    const timer = textEditTimers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      textEditTimers.current.delete(id);
    }
    setEditingAnnotationId((current) => (current === id ? null : current));
    if (cancel) {
      const snap = editSnapshots.current.get(id);
      editSnapshots.current.delete(id);
      if (snap) {
        updateAnnotations((prev) => prev.map((a) => (a.id === id ? snap : a)));
      }
      return;
    }
    editSnapshots.current.delete(id);
    // Geometry/text already committed via onCommit before end; avoid a second
    // save that could race and remount the editor.
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

  function beginLeftResize(e: ReactPointerEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = leftWidth;

    function onMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      setLeftWidth(clamp(startWidth + delta, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH));
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

  const onSelectQuestion = useCallback(
    (qid: string) => {
      setSelectedQuestionId(qid);
      const block = assessable.find((b) => b.question_id === qid);
      if (block?.block_type === "scanned_homework_upload") {
        const parentId = parentScannedUploadBlockId(block);
        if (parentId) openScannedBlock(parentId);
      } else {
        setCentreView({ kind: "worksheet" });
      }
    },
    [assessable, openScannedBlock],
  );

  const worksheetAnnotations = annotations.filter(
    (a) => a.target_kind === "worksheet" && !a.is_deleted,
  );
  const fileAnnotations = annotations.filter((a) => {
    if (a.is_deleted || a.target_kind === "worksheet") return false;
    if (centreView.kind !== "file") return false;
    if (!a.target_path) return true;
    return a.target_path === centreView.path;
  });
  const scannedBlockMarkScheme =
    selectedBlock?.block_type === "scanned_homework_upload"
      ? selectedBlock.scannedUploadConfig
      : null;
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
            variant="secondary"
            disabled={releaseBusy}
            onClick={() => void handleReleaseFeedback()}
          >
            {feedbackReleasedAt
              ? "Re-release feedback"
              : "Release feedback to student"}
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
            ? `${TOOLBAR_MIN_WIDTH}px minmax(${leftOpen ? LEFT_MIN_WIDTH : 40}px, ${leftOpen ? leftWidth : 40}px) minmax(0, 1fr) minmax(${rightOpen ? RIGHT_MIN_WIDTH + 56 : 56}px, ${rightOpen ? rightWidth + 56 : 56}px)`
            : `minmax(${leftOpen ? LEFT_MIN_WIDTH : 40}px, ${leftOpen ? leftWidth : 40}px) minmax(0, 1fr) minmax(${rightOpen ? RIGHT_MIN_WIDTH + 56 : 56}px, ${rightOpen ? rightWidth + 56 : 56}px)`,
        }}
      >
        {toolbarDocked ? (
          <AnnotationToolbar
            tool={tool}
            colour={colour}
            stamps={stamps}
            selectedStampId={selectedStampId}
            readyStampPaths={readyStampPaths}
            canUndo={canUndo}
            canRedo={canRedo}
            docked
            collapsed={toolbarCollapsed}
            floatingPos={floatingPos}
            onToolChange={setTool}
            onColourChange={setColour}
            onStampSelect={setSelectedStampId}
            onStampPaletteDragStart={(stampId) => {
              if (!stampId) {
                setPaletteStampDragId(null);
                return;
              }
              setSelectedStampId(stampId);
              setTool("stamp");
              setPaletteStampDragId(stampId);
            }}
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
          <aside className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
            <button
              type="button"
              aria-label="Resize question navigation. Drag to resize. Double-click to reset."
              title="Drag to resize navigation"
              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70"
              onPointerDown={beginLeftResize}
              onDoubleClick={() => setLeftWidth(LEFT_DEFAULT_WIDTH)}
            />
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-2 py-2 pr-3">
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
                    const complete = isQuestionMarkingComplete(mark);
                    const progress = formatQuestionMarkProgress(
                      mark,
                      Number(block.max_marks ?? 0),
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
                            setSelectedQuestionId(qid);
                            if (block.block_type === "scanned_homework_upload") {
                              const parentId = parentScannedUploadBlockId(block);
                              if (parentId) openScannedBlock(parentId);
                            } else {
                              setCentreView({ kind: "worksheet" });
                            }
                          }}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate font-medium">
                              Q{index + 1}{" "}
                              {block.content || block.prompt || "Question"}
                            </span>
                            <span className="shrink-0 tabular-nums text-[11px] text-slate-600">
                              {progress}
                              {complete ? " ✓" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {leftTab === "files" ? (
                <ul className="space-y-2">
                  {[...scannedFilesByBlock.entries()].map(([blockId, files]) => {
                    const preview = files.find(
                      (f) =>
                        f.preview_storage_path &&
                        f.preview_storage_path !== f.original_storage_path,
                    );
                    return (
                      <li key={blockId}>
                        <button
                          type="button"
                          className="w-full rounded-xl border border-slate-100 px-2 py-2 text-left hover:bg-slate-50"
                          onClick={() => openScannedBlock(blockId)}
                        >
                          <span className="block text-sm font-medium">
                            Scanned homework
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {files.length} file
                            {files.length === 1 ? "" : "s"}
                            {preview ? " · combined preview" : ""}
                          </span>
                        </button>
                        <ul className="mt-1 space-y-1 pl-2">
                          {files.map((file) => (
                            <li key={file.id}>
                              <button
                                type="button"
                                className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                onClick={() =>
                                  setCentreView({
                                    kind: "file",
                                    fileName: file.original_file_name,
                                    path:
                                      file.preview_storage_path ||
                                      file.original_storage_path,
                                    bucket: "student-submissions",
                                    annotatable: true,
                                    rotation: file.rotation,
                                    originalPath: file.original_storage_path,
                                  })
                                }
                              >
                                {file.original_file_name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
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
                            annotatable: true,
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
                              annotatable: true,
                            })
                          }
                        >
                          {r.file_name}
                        </button>
                      </li>
                    ))}
                  {!legacyFileName &&
                  !responses.some((r) => r.storage_path) &&
                  scannedFilesByBlock.size === 0 ? (
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
              aria-label="Zoom out"
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
              aria-label="Zoom in"
              onClick={() => {
                setFit("none");
                setZoom((z) => Math.min(2, z + 0.1));
              }}
            >
              Zoom +
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Fit width"
              onClick={() => setFit("width")}
            >
              Fit width
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Fit page"
              onClick={() => setFit("page")}
            >
              Fit page
            </Button>
            <span className="text-slate-500">
              Question {selectedQuestionIndex >= 0 ? selectedQuestionIndex + 1 : "—"} of{" "}
              {questionIds.length} · {markTotals.markedCount} marked · Total{" "}
              {markTotals.awarded}/{maximumMark}
            </span>
          </div>

          {centreView.kind === "file" ? (
            <div className="relative min-h-0 flex-1 overflow-auto">
              <div className="relative min-h-full">
                <FileViewer
                  fileName={centreView.fileName}
                  storagePath={centreView.path}
                  bucket={centreView.bucket}
                  zoom={zoom}
                  fit={fit}
                  rotation={centreView.rotation}
                  downloadPath={centreView.originalPath ?? centreView.path}
                  onPageCount={(pages) => {
                    if (centreView.kind !== "file") return;
                    if (!centreView.pageNumber) {
                      setCentreView({ ...centreView, pageNumber: 1 });
                    }
                    void pages;
                  }}
                />
                {centreView.annotatable ? (
                  <div className="pointer-events-none absolute inset-0 z-[6]">
                    <div className="pointer-events-auto absolute inset-x-0 top-12 bottom-0 mx-auto max-w-4xl">
                      <AnnotationLayer
                        annotations={fileAnnotations}
                        tool={tool}
                        colour={colour}
                        selectedId={selectedAnnotationId}
                        editingId={editingAnnotationId}
                        selectedStampId={selectedStampId}
                        stamps={stamps}
                        linkedCommentDrag={null}
                        paletteStampDragId={paletteStampDragId}
                        onSelect={handleAnnotationSelect}
                        onCreate={createAnnotation}
                        onCommitGeometry={handleCommitGeometry}
                        onToggleCollapse={handleToggleCollapse}
                        onBeginInlineEdit={handleBeginInlineEdit}
                        onEndInlineEdit={handleEndInlineEdit}
                        onPaletteStampDrop={() => setPaletteStampDragId(null)}
                        onDeleteSelected={(id) => {
                          const targetId = id ?? selectedAnnotationId;
                          if (targetId) deleteAnnotationById(targetId);
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <MarkAwardFlash flash={markFlash} />
            </div>
          ) : (
            <div
              data-marking-worksheet-scroll="true"
              className="relative min-h-0 flex-1 overflow-auto bg-slate-300/50 p-6"
            >
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
                  editingId={editingAnnotationId}
                  selectedStampId={selectedStampId}
                  stamps={stamps}
                  linkedCommentDrag={null}
                  paletteStampDragId={paletteStampDragId}
                  onSelect={handleAnnotationSelect}
                  onCreate={createAnnotation}
                  onCommitGeometry={handleCommitGeometry}
                  onToggleCollapse={handleToggleCollapse}
                  onBeginInlineEdit={handleBeginInlineEdit}
                  onEndInlineEdit={handleEndInlineEdit}
                  onPaletteStampDrop={() => setPaletteStampDragId(null)}
                  onDeleteSelected={(id) => {
                    const targetId = id ?? selectedAnnotationId;
                    if (targetId) deleteAnnotationById(targetId);
                  }}
                />
                {!stampsReady ? (
                  <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-slate-900/70 px-2 py-1 text-[11px] text-white">
                    Loading stamps…
                  </div>
                ) : null}
              </div>
              <MarkAwardFlash flash={markFlash} />
            </div>
          )}
        </main>

        <div className="relative flex min-h-0 min-w-0 overflow-hidden bg-white">
          {rightOpen ? (
            <aside className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                  {selectedBlock && selectedQuestionId ? (
                    <QuestionMarkControls
                      questionId={selectedQuestionId}
                      questionIndex={Math.max(0, selectedQuestionIndex)}
                      questionLabel={
                        selectedBlock.content ||
                        selectedBlock.prompt ||
                        ""
                      }
                      maximumMark={Number(selectedBlock.max_marks ?? 0)}
                      mode={inferMarkingMode(selectedBlock)}
                      record={selectedMark}
                      canGoPrev={selectedQuestionIndex > 0}
                      canGoNext={
                        selectedQuestionIndex >= 0 &&
                        selectedQuestionIndex < questionIds.length - 1
                      }
                      onReview={(state) => updateMark({ review_state: state })}
                      onFeedback={(text) =>
                        updateMark(
                          { question_feedback: text },
                          { debounceMs: QUESTION_FEEDBACK_DEBOUNCE_MS },
                        )
                      }
                      onPrev={() => void goQuestion(-1)}
                      onNext={() => void goQuestion(1)}
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
                  />
                </section>

                {(selectedBlock?.mark_scheme_note ||
                  markSchemes.length > 0 ||
                  scannedBlockMarkScheme?.mark_scheme_storage_path) && (
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
                      {scannedBlockMarkScheme?.mark_scheme_storage_path ? (
                        <button
                          type="button"
                          className="block w-full text-left text-slate-700 underline-offset-2 hover:underline"
                          onClick={() =>
                            setCentreView({
                              kind: "file",
                              fileName:
                                scannedBlockMarkScheme.mark_scheme_file_name ||
                                "Mark scheme.pdf",
                              path: scannedBlockMarkScheme.mark_scheme_storage_path!,
                              bucket: "assignment-resources",
                              annotatable: false,
                            })
                          }
                        >
                          {scannedBlockMarkScheme.mark_scheme_file_name ||
                            "Block mark scheme"}
                        </button>
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
                              annotatable: false,
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
              className="flex w-10 min-w-10 shrink-0 items-start justify-center border-r border-slate-200 bg-white py-2 text-xs"
              onClick={() => setRightOpen(true)}
              title="Expand marking panel"
              aria-label="Expand marking panel"
            >
              ««
            </button>
          )}
          {selectedBlock &&
          selectedQuestionId &&
          (inferMarkingMode(selectedBlock) === "numeric" ||
            inferMarkingMode(selectedBlock) === "auto_mcq") ? (
            <VerticalMarkStrip
              maximumMark={Number(selectedBlock.max_marks ?? 0)}
              awarded={selectedMark?.awarded_mark ?? null}
              notAttempted={Boolean(selectedMark?.not_attempted)}
              allowDecimals={allowDecimalMarks}
              onAward={(mark) =>
                updateMark({ awarded_mark: mark, not_attempted: false })
              }
              onNotAttempted={() =>
                updateMark({ not_attempted: true, awarded_mark: 0 })
              }
            />
          ) : (
            <div className="w-14 shrink-0 border-l border-slate-200 bg-slate-50" />
          )}
        </div>
      </div>

      {!toolbarDocked ? (
        <AnnotationToolbar
          tool={tool}
          colour={colour}
          stamps={stamps}
          selectedStampId={selectedStampId}
          readyStampPaths={readyStampPaths}
          canUndo={canUndo}
          canRedo={canRedo}
          docked={false}
          collapsed={toolbarCollapsed}
          floatingPos={floatingPos}
          onToolChange={setTool}
          onColourChange={setColour}
          onStampSelect={setSelectedStampId}
          onStampPaletteDragStart={(stampId) => {
            if (!stampId) {
              setPaletteStampDragId(null);
              return;
            }
            setSelectedStampId(stampId);
            setTool("stamp");
            setPaletteStampDragId(stampId);
          }}
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

      {paletteStampDragId ? (
        <div className="pointer-events-none fixed inset-0 z-[80]">
          <div className="absolute left-3 top-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] text-white">
            Drop stamp on the worksheet
          </div>
        </div>
      ) : null}
    </div>
  );
}

