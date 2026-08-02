"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  confirmScannedUploadAction,
  finalizeScannedUploadPreviewAction,
  listScannedUploadFilesAction,
  prepareScannedUploadAction,
  removeScannedUploadFileAction,
  replaceScannedUploadSetAction,
  updateScannedUploadFileAction,
} from "@/lib/actions/scanned-uploads";
import type { ScannedUploadConfig } from "@/lib/types";
import {
  UPLOAD_CONCURRENCY,
  UPLOAD_START_FAIL_MS,
  UPLOAD_START_WATCHDOG_MS,
  buildUploadQueueItems,
  createEmptyUploadQueue,
  isUploadBusyState,
  pickNextUploadJobs,
  uploadQueuePhaseLabel,
  uploadQueueReducer,
  type UploadQueueItem,
} from "@/lib/homework/scanned-upload-queue-reducer";

const STALL_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
const PREPARE_TIMEOUT_MS = 10_000;
const METADATA_TIMEOUT_MS = 10_000;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function acceptFromConfig(config: ScannedUploadConfig): string {
  const parts: string[] = [];
  if (config.allow_pdf) parts.push(".pdf,application/pdf");
  if (config.allow_images) parts.push(".jpg,.jpeg,.png,image/jpeg,image/png");
  if (config.allow_docx) {
    parts.push(
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  }
  return parts.join(",") || ".pdf,.jpg,.jpeg,.png";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out`)),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Diagnostic breadcrumbs for the upload path. Kept concise; failures always
 * go through console.error with structured context.
 */
function logUpload(event: string, detail?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[scanned-upload] ${event}`, detail ?? {});
}

export function ScannedHomeworkUploadField({
  submissionId,
  blockId,
  questionId,
  config,
  editable,
  required,
  onFilesChanged,
  onBusyChange,
}: {
  submissionId: string | null;
  blockId: string;
  questionId: string | null;
  config: ScannedUploadConfig;
  editable: boolean;
  required?: boolean;
  onFilesChanged?: (summary: {
    file_count: number;
    file_names: string[];
  }) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [queue, dispatch] = useReducer(
    uploadQueueReducer,
    undefined,
    createEmptyUploadQueue,
  );
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const queueRef = useRef(queue);
  const activeIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const lastSummaryRef = useRef("");
  const abortsRef = useRef(new Map<string, AbortController>());
  const pumpRef = useRef<() => void>(() => {});

  // Keep the worker's queue snapshot current before paint/effects so
  // pumpQueue never reads a stale empty array after QUEUE_FILES.
  useLayoutEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    mountedRef.current = true;
    const aborts = abortsRef.current;
    const activeIds = activeIdsRef.current;
    return () => {
      mountedRef.current = false;
      for (const abort of aborts.values()) abort.abort();
      aborts.clear();
      activeIds.clear();
    };
  }, []);

  const notifySummary = useCallback(
    (items: UploadQueueItem[]) => {
      const remotes = items.filter(
        (i) =>
          i.databaseFileId &&
          i.state !== "failed" &&
          i.state !== "cancelled",
      );
      const summary = {
        file_count: remotes.length,
        file_names: remotes.map((f) => f.name),
      };
      const key = JSON.stringify(summary);
      if (key === lastSummaryRef.current) return;
      lastSummaryRef.current = key;
      onFilesChanged?.(summary);
    },
    [onFilesChanged],
  );

  useEffect(() => {
    notifySummary(queue.items);
    onBusyChange?.(queue.items.some((i) => isUploadBusyState(i.state)));
  }, [queue.items, notifySummary, onBusyChange]);

  const runPreviewInBackground = useCallback(
    async (clientId: string, mimeType: string) => {
      if (!submissionId) {
        dispatch({ type: "READY", clientId });
        return;
      }
      const sid = submissionId;
      const needsCombine =
        config.combine_images_to_pdf && mimeType.startsWith("image/");
      if (!needsCombine) {
        dispatch({ type: "READY", clientId });
        logUpload("file ready", { clientId });
        void finalizeScannedUploadPreviewAction(sid, blockId, {
          combineImagesToPdf: config.combine_images_to_pdf,
        });
        return;
      }
      dispatch({ type: "PROCESSING_PREVIEW", clientId });
      logUpload("preview processing started", { clientId });
      try {
        await finalizeScannedUploadPreviewAction(sid, blockId, {
          combineImagesToPdf: true,
        });
      } catch (err) {
        console.error("[scanned-upload] preview failed", err);
      } finally {
        dispatch({ type: "READY", clientId });
        logUpload("file ready", { clientId });
      }
    },
    [blockId, config.combine_images_to_pdf, submissionId],
  );

  const processItem = useCallback(
    async (item: UploadQueueItem) => {
      const clientId = item.clientId;
      const file = item.file;
      if (!file) {
        dispatch({
          type: "FAILED",
          clientId,
          error: "The upload could not start. Retry.",
        });
        return;
      }
      const resolvedSubmissionId = submissionId;
      if (!resolvedSubmissionId) {
        dispatch({
          type: "FAILED",
          clientId,
          error: "The submission could not be prepared. Retry.",
        });
        logUpload("file failed", { clientId, reason: "missing submissionId" });
        return;
      }

      const abort = new AbortController();
      abortsRef.current.set(clientId, abort);
      dispatch({ type: "START_PREPARING", clientId });
      logUpload("submission resolved", {
        clientId,
        submissionId: resolvedSubmissionId,
      });

      let lastProgressAt = Date.now();
      const stallTimer = window.setInterval(() => {
        if (Date.now() - lastProgressAt > STALL_MS) {
          abort.abort();
          dispatch({
            type: "FAILED",
            clientId,
            error:
              "No upload progress for 20 seconds. Check your connection and retry.",
          });
          window.clearInterval(stallTimer);
        }
      }, 2_000);
      const hardTimeout = window.setTimeout(() => {
        abort.abort();
        dispatch({
          type: "FAILED",
          clientId,
          error: "The upload timed out. Please retry.",
        });
      }, UPLOAD_TIMEOUT_MS);

      try {
        logUpload("upload token requested", { clientId, name: file.name });
        const prepared = await withTimeout(
          prepareScannedUploadAction({
            submissionId: resolvedSubmissionId,
            blockId,
            questionId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            displayOrder: item.order,
          }),
          PREPARE_TIMEOUT_MS,
          "Upload preparation",
        );
        if (abort.signal.aborted || !mountedRef.current) return;
        if (prepared.error || !prepared.prepared) {
          dispatch({
            type: "FAILED",
            clientId,
            error:
              prepared.error ??
              "The file could not be uploaded to storage. Please retry.",
          });
          logUpload("file failed", { clientId, reason: prepared.error });
          return;
        }

        dispatch({
          type: "START_UPLOAD",
          clientId,
          storagePath: prepared.prepared.storagePath,
        });
        logUpload("storage upload started", {
          clientId,
          path: prepared.prepared.storagePath,
        });

        const supabase = createClient();
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", prepared.prepared!.signedUrl);
          xhr.setRequestHeader(
            "Content-Type",
            prepared.prepared!.mimeType || "application/octet-stream",
          );
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            lastProgressAt = Date.now();
            const pct = Math.min(
              99,
              Math.round((event.loaded / event.total) * 100),
            );
            dispatch({ type: "SET_PROGRESS", clientId, progress: pct });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Storage upload failed (${xhr.status})`));
          };
          xhr.onerror = () =>
            reject(new Error("The file could not be uploaded to storage."));
          xhr.onabort = () => reject(new Error("Upload cancelled"));
          abort.signal.addEventListener("abort", () => xhr.abort());
          xhr.send(file);
        }).catch(async (xhrError) => {
          if (abort.signal.aborted) throw xhrError;
          const { error } = await supabase.storage
            .from("student-submissions")
            .uploadToSignedUrl(
              prepared.prepared!.storagePath,
              prepared.prepared!.token,
              file,
              { contentType: prepared.prepared!.mimeType, upsert: false },
            );
          if (error) throw error;
        });

        if (abort.signal.aborted || !mountedRef.current) return;

        dispatch({
          type: "UPLOAD_COMPLETE",
          clientId,
          storagePath: prepared.prepared.storagePath,
        });
        logUpload("storage upload completed", { clientId });

        logUpload("metadata insert started", { clientId });
        const confirmed = await withTimeout(
          confirmScannedUploadAction({
            submissionId: resolvedSubmissionId,
            blockId,
            questionId,
            fileId: prepared.prepared.fileId,
            storagePath: prepared.prepared.storagePath,
            originalFileName: prepared.prepared.originalFileName,
            mimeType: prepared.prepared.mimeType,
            fileSize: prepared.prepared.fileSize,
            displayOrder: prepared.prepared.displayOrder,
            submissionVersion: prepared.prepared.submissionVersion,
          }),
          METADATA_TIMEOUT_MS,
          "Metadata insertion",
        );
        if (confirmed.error || !confirmed.file) {
          dispatch({
            type: "FAILED",
            clientId,
            error:
              confirmed.error ??
              "The upload completed, but the file record could not be saved.",
          });
          logUpload("file failed", { clientId, reason: confirmed.error });
          return;
        }

        dispatch({
          type: "METADATA_COMPLETE",
          clientId,
          databaseFileId: confirmed.file.id,
          remoteName: confirmed.file.original_file_name,
          remoteSize: confirmed.file.file_size,
        });
        // Remap clientId tracking to database id for preview/ready.
        logUpload("metadata insert completed", {
          clientId,
          databaseFileId: confirmed.file.id,
        });

        // Keep the same clientId in the reducer; preview uses it.
        void runPreviewInBackground(clientId, confirmed.file.mime_type);
      } catch (err) {
        if (abort.signal.aborted) {
          const current = queueRef.current.items.find(
            (i) => i.clientId === clientId,
          );
          if (current?.state === "failed") return;
          dispatch({
            type: "FAILED",
            clientId,
            error: "Upload cancelled.",
          });
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "The file could not be uploaded to storage. Please retry.";
        const friendly = /JWT|session|auth|401|403/i.test(message)
          ? "Your session expired during upload. Sign in again and retry."
          : /submission could not be prepared|timed out/i.test(message)
            ? message.includes("preparation") || message.includes("Submission")
              ? "The submission could not be prepared. Retry."
              : message.includes("Metadata")
                ? "The upload completed, but the file record could not be saved."
                : "The upload could not start. Retry."
            : /type|mime|accepted/i.test(message)
              ? "This file type is not accepted."
              : /size|large|limit|too big/i.test(message)
                ? `The file is larger than the ${formatBytes(config.maximum_file_size_bytes)} limit.`
                : "The file could not be uploaded to storage. Please retry.";
        console.error("[scanned-upload] file failed", { clientId, message });
        dispatch({ type: "FAILED", clientId, error: friendly });
        logUpload("file failed", { clientId, message });
      } finally {
        window.clearInterval(stallTimer);
        window.clearTimeout(hardTimeout);
        abortsRef.current.delete(clientId);
        activeIdsRef.current.delete(clientId);
        // Guaranteed unlock — worker continues.
        pumpRef.current();
      }
    },
    [
      blockId,
      config.maximum_file_size_bytes,
      questionId,
      runPreviewInBackground,
      submissionId,
    ],
  );

  const pumpQueue = useCallback(() => {
    if (!mountedRef.current) return;
    const slots = UPLOAD_CONCURRENCY - activeIdsRef.current.size;
    // Always read the latest reducer snapshot from the ref — never a stale
    // closure captured before QUEUE_FILES committed.
    const jobs = pickNextUploadJobs(
      queueRef.current,
      activeIdsRef.current,
      slots,
    );
    for (const job of jobs) {
      activeIdsRef.current.add(job.clientId);
      logUpload("file queued", {
        clientId: job.clientId,
        name: job.name,
        size: job.size,
      });
      void processItem(job);
    }
  }, [processItem]);

  useEffect(() => {
    pumpRef.current = pumpQueue;
  }, [pumpQueue]);

  // Observe reducer state so queueing always starts the worker after commit,
  // and also recover if a concurrent slot frees.
  useEffect(() => {
    pumpQueue();
  }, [queue.items, pumpQueue]);

  // Watchdog: if items sit in queued with free concurrency, restart the worker.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const queued = queueRef.current.items.filter((i) => i.state === "queued");
      if (!queued.length) return;
      const free = UPLOAD_CONCURRENCY - activeIdsRef.current.size;
      if (free > 0) {
        const oldest = Math.min(...queued.map((q) => q.queuedAt));
        if (now - oldest > UPLOAD_START_WATCHDOG_MS) {
          console.warn("[scanned-upload] restarting stalled queue worker");
          pumpRef.current();
        }
      }
      for (const item of queued) {
        if (
          now - item.queuedAt > UPLOAD_START_FAIL_MS &&
          !activeIdsRef.current.has(item.clientId)
        ) {
          dispatch({
            type: "FAILED",
            clientId: item.clientId,
            error: "The upload could not start. Retry.",
          });
        }
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const reloadFromServer = useCallback(async () => {
    if (!submissionId) return;
    const sid = submissionId;
    const result = await listScannedUploadFilesAction(sid, blockId);
    if (result.error) {
      setGlobalError(result.error);
      return;
    }
    const remotes = (result.files ?? []).map((file, index) => ({
      clientId: file.id,
      file: null,
      name: file.original_file_name,
      size: file.file_size,
      mimeType: file.mime_type,
      blockId,
      submissionId: sid,
      storagePath: file.original_storage_path,
      progress: 100,
      state: "ready" as const,
      error: null,
      retryCount: 0,
      databaseFileId: file.id,
      order: file.display_order ?? index,
      previewUrl: null,
      queuedAt: 0,
    }));
    dispatch({ type: "HYDRATE_REMOTE", items: remotes });
  }, [blockId, submissionId]);

  useEffect(() => {
    if (!submissionId) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    void reloadFromServer();
  }, [reloadFromServer, submissionId]);

  function validateFile(file: File): string | null {
    if (file.size > config.maximum_file_size_bytes) {
      return `“${file.name}” exceeds the maximum size of ${formatBytes(config.maximum_file_size_bytes)}.`;
    }
    if (
      config.allowed_mime_types.length &&
      !config.allowed_mime_types.includes(file.type) &&
      !(config.allow_images && file.type.startsWith("image/")) &&
      !(config.allow_pdf && file.type === "application/pdf") &&
      !(
        config.allow_docx &&
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ) {
      return `“${file.name}” is not an allowed file type.`;
    }
    return null;
  }

  function onFilesSelected(list: FileList | null) {
    if (!list?.length || !editable) return;
    setGlobalError(null);

    if (!submissionId) {
      setGlobalError("The submission could not be prepared. Retry.");
      return;
    }

    const existingCount = queueRef.current.items.filter(
      (i) => i.state !== "failed" && i.state !== "cancelled",
    ).length;
    const remaining = config.maximum_files - existingCount;
    if (remaining <= 0) {
      setGlobalError(
        `You can upload at most ${config.maximum_files} file(s).`,
      );
      return;
    }

    const batch = Array.from(list).slice(0, remaining);
    const accepted: File[] = [];
    for (const file of batch) {
      const err = validateFile(file);
      if (err) {
        setGlobalError(err);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    // 1) Build items synchronously with File objects attached.
    const items = buildUploadQueueItems({
      files: accepted,
      blockId,
      submissionId,
      startingOrder: existingCount,
    });
    // 2) Dispatch into the reducer.
    dispatch({ type: "QUEUE_FILES", items });
    // 3) Also kick the worker with the freshly built items so we do not
    //    depend on React having flushed state yet.
    for (const item of items) {
      if (activeIdsRef.current.size >= UPLOAD_CONCURRENCY) break;
      if (activeIdsRef.current.has(item.clientId)) continue;
      activeIdsRef.current.add(item.clientId);
      logUpload("file queued", {
        clientId: item.clientId,
        name: item.name,
        immediate: true,
      });
      void processItem(item);
    }
  }

  function retryItem(clientId: string) {
    const item = queueRef.current.items.find((i) => i.clientId === clientId);
    if (!item) return;
    if (!item.file && !item.databaseFileId) {
      setGlobalError("Select the file again to retry this upload.");
      return;
    }
    if (!item.file && item.databaseFileId) {
      void reloadFromServer();
      return;
    }
    dispatch({ type: "RETRY", clientId });
    // Immediate kick with the current File from the snapshot.
    const retried = {
      ...item,
      state: "queued" as const,
      progress: 0,
      error: null,
      retryCount: item.retryCount + 1,
      queuedAt: Date.now(),
    };
    if (
      retried.file &&
      activeIdsRef.current.size < UPLOAD_CONCURRENCY &&
      !activeIdsRef.current.has(clientId)
    ) {
      activeIdsRef.current.add(clientId);
      void processItem(retried);
    } else {
      pumpRef.current();
    }
  }

  function cancelItem(clientId: string) {
    abortsRef.current.get(clientId)?.abort();
    abortsRef.current.delete(clientId);
    activeIdsRef.current.delete(clientId);
    dispatch({ type: "CANCELLED", clientId });
    pumpRef.current();
  }

  async function replaceAll() {
    if (!editable || !config.allow_replacement || !submissionId) return;
    setGlobalError(null);
    const result = await replaceScannedUploadSetAction(submissionId, blockId);
    if (result.error) {
      setGlobalError(result.error);
      return;
    }
    for (const abort of abortsRef.current.values()) abort.abort();
    abortsRef.current.clear();
    activeIdsRef.current.clear();
    dispatch({ type: "REPLACE_ALL" });
    onFilesChanged?.({ file_count: 0, file_names: [] });
  }

  const typesLabel = [
    config.allow_pdf ? "PDF" : null,
    config.allow_images ? "JPG, JPEG, PNG" : null,
    config.allow_docx ? "DOCX" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const items = queue.items;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="text-xs text-slate-600">
        <p>
          Accepted: {typesLabel || "PDF, JPG, PNG"} · Max{" "}
          {formatBytes(config.maximum_file_size_bytes)} · Up to{" "}
          {config.maximum_files} file
          {config.maximum_files === 1 ? "" : "s"}
          {required ? " · Required" : ""}
        </p>
      </div>

      {!submissionId ? (
        <p className="text-xs text-amber-800">
          Preparing your submission… Refresh if the upload area does not appear.
        </p>
      ) : null}

      {editable && submissionId ? (
        <div
          className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver
              ? "border-slate-700 bg-white"
              : "border-slate-300 bg-white/70"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFilesSelected(e.dataTransfer.files);
          }}
        >
          <p className="text-sm font-medium text-slate-800">
            Drag and drop files here
          </p>
          <p className="mt-1 text-xs text-slate-500">or</p>
          <label className="mt-2 inline-block">
            <span className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
              Choose files
            </span>
            <input
              type="file"
              className="sr-only"
              accept={acceptFromConfig(config)}
              multiple={config.maximum_files > 1}
              onChange={(e) => {
                onFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {editable &&
      items.some((i) => i.databaseFileId) &&
      config.allow_replacement ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void replaceAll()}
          >
            Replace all files
          </Button>
        </div>
      ) : null}

      {globalError ? (
        <p className="text-xs text-rose-700">{globalError}</p>
      ) : null}

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.clientId}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            {item.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {item.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(item.size)}
                {" · "}
                <span
                  className={
                    item.state === "failed"
                      ? "text-rose-700"
                      : item.state === "ready"
                        ? "text-emerald-700"
                        : "text-slate-600"
                  }
                >
                  {uploadQueuePhaseLabel(item.state, item.progress)}
                </span>
              </p>
              {item.state === "uploading" ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-slate-700 transition-[width]"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              ) : null}
              {item.error ? (
                <p className="mt-1 text-xs text-rose-700">{item.error}</p>
              ) : null}
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-1">
                {item.state === "uploading" ||
                item.state === "queued" ||
                item.state === "preparing" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => cancelItem(item.clientId)}
                  >
                    Cancel
                  </Button>
                ) : null}
                {item.state === "failed" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => retryItem(item.clientId)}
                  >
                    Retry
                  </Button>
                ) : null}
                {item.databaseFileId &&
                item.state !== "uploading" &&
                item.state !== "queued" &&
                item.state !== "preparing" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() =>
                        void (async () => {
                          const prev = items[index - 1];
                          if (!prev?.databaseFileId || !item.databaseFileId)
                            return;
                          await updateScannedUploadFileAction(
                            item.databaseFileId,
                            { display_order: prev.order },
                          );
                          await updateScannedUploadFileAction(
                            prev.databaseFileId,
                            { display_order: item.order },
                          );
                          await reloadFromServer();
                        })()
                      }
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={index === items.length - 1}
                      onClick={() =>
                        void (async () => {
                          const next = items[index + 1];
                          if (!next?.databaseFileId || !item.databaseFileId)
                            return;
                          await updateScannedUploadFileAction(
                            item.databaseFileId,
                            { display_order: next.order },
                          );
                          await updateScannedUploadFileAction(
                            next.databaseFileId,
                            { display_order: item.order },
                          );
                          await reloadFromServer();
                        })()
                      }
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void (async () => {
                          if (!item.databaseFileId) return;
                          await removeScannedUploadFileAction(
                            item.databaseFileId,
                          );
                          await reloadFromServer();
                        })()
                      }
                    >
                      Remove
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {!items.length ? (
        <p className="text-xs text-slate-500">
          {editable ? "No files uploaded yet." : "No file submitted."}
        </p>
      ) : null}
    </div>
  );
}
