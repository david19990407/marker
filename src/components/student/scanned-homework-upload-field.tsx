"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type ScannedUploadFileRow,
} from "@/lib/actions/scanned-uploads";
import type { ScannedUploadConfig } from "@/lib/types";
import {
  isScannedUploadBusyPhase,
  scannedUploadPhaseLabel,
  type ScannedUploadPhase,
} from "@/lib/homework/scanned-upload-path";
import {
  SCANNED_UPLOAD_START_TIMEOUT_MS,
  requeueUploadJob,
  releaseUploadJob,
  takeNextUploadJobs,
  type QueuePumpState,
} from "@/lib/homework/scanned-upload-queue";

type FilePhase = ScannedUploadPhase;

type LocalUploadItem = {
  localId: string;
  file: File | null;
  name: string;
  size: number;
  mimeType: string;
  order: number;
  phase: FilePhase;
  progress: number;
  error: string | null;
  remote: ScannedUploadFileRow | null;
  abort: AbortController | null;
  previewUrl: string | null;
  queuedAt: number;
};

const STALL_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

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
  submissionId: string;
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
  const [items, setItems] = useState<LocalUploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const itemsRef = useRef(items);
  const lastSummaryRef = useRef<string>("");
  /** File payloads independent of React state commit timing. */
  const pendingFilesRef = useRef(new Map<string, File>());
  const queueStateRef = useRef<QueuePumpState>({
    queue: [],
    activeCount: 0,
    inFlight: new Set(),
  });
  const pumpQueueRef = useRef<() => void>(() => {});
  const startWatchersRef = useRef(new Map<string, number>());

  useEffect(() => {
    mountedRef.current = true;
    const startWatchers = startWatchersRef.current;
    return () => {
      mountedRef.current = false;
      for (const item of itemsRef.current) {
        item.abort?.abort();
      }
      for (const timer of startWatchers.values()) {
        window.clearTimeout(timer);
      }
      startWatchers.clear();
    };
  }, []);

  const syncItems = useCallback(
    (updater: (prev: LocalUploadItem[]) => LocalUploadItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        // Keep the worker on the latest list synchronously — do not wait for
        // an effect after render (that left uploads stuck on Queued/Waiting).
        itemsRef.current = next;
        return next;
      });
    },
    [],
  );

  const notifySummary = useCallback(
    (list: LocalUploadItem[]) => {
      const remotes = list
        .filter((i) => i.remote && i.phase !== "error")
        .map((i) => i.remote!);
      const summary = {
        file_count: remotes.length,
        file_names: remotes.map((f) => f.original_file_name),
      };
      const key = JSON.stringify(summary);
      // Avoid thrashing assignment autosave on every progress tick.
      if (key === lastSummaryRef.current) return;
      lastSummaryRef.current = key;
      onFilesChanged?.(summary);
    },
    [onFilesChanged],
  );

  const patchItem = useCallback(
    (localId: string, patch: Partial<LocalUploadItem>) => {
      syncItems((prev) => {
        const next = prev.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        );
        if (
          "remote" in patch ||
          patch.phase === "ready" ||
          patch.phase === "error" ||
          patch.phase === "uploaded"
        ) {
          notifySummary(next);
        }
        return next;
      });
    },
    [notifySummary, syncItems],
  );

  const reloadFromServer = useCallback(async () => {
    const result = await listScannedUploadFilesAction(submissionId, blockId);
    if (result.error) {
      setGlobalError(result.error);
      return;
    }
    const remotes = result.files ?? [];
    syncItems((prev) => {
      // Keep in-flight local rows; merge remotes for completed ones.
      const uploading = prev.filter(
        (p) =>
          p.phase === "queued" ||
          p.phase === "uploading" ||
          p.phase === "stalled",
      );
      const remoteItems: LocalUploadItem[] = remotes.map((file, index) => ({
        localId: file.id,
        file: null,
        name: file.original_file_name,
        size: file.file_size,
        mimeType: file.mime_type,
        order: file.display_order ?? index,
        phase: "ready" as const,
        progress: 100,
        error: null,
        remote: file,
        abort: null,
        previewUrl: null,
        queuedAt: 0,
      }));
      const next = [...remoteItems, ...uploading].sort(
        (a, b) => a.order - b.order,
      );
      notifySummary(next);
      return next;
    });
  }, [submissionId, blockId, notifySummary, syncItems]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void reloadFromServer();
  }, [reloadFromServer]);

  useEffect(() => {
    const busy = items.some((i) => isScannedUploadBusyPhase(i.phase));
    onBusyChange?.(busy);
  }, [items, onBusyChange]);

  const runPreviewInBackground = useCallback(
    async (localId: string, mimeType: string) => {
      const needsCombineWork =
        config.combine_images_to_pdf && mimeType.startsWith("image/");
      if (!needsCombineWork) {
        // PDF / single original is immediately usable for marking.
        patchItem(localId, { phase: "ready" });
        void finalizeScannedUploadPreviewAction(submissionId, blockId, {
          combineImagesToPdf: config.combine_images_to_pdf,
        }).then((result) => {
          if (!result.files) return;
          setItems((prev) => {
            const byId = new Map(result.files!.map((f) => [f.id, f]));
            return prev.map((item) => {
              if (!item.remote) return item;
              const refreshed = byId.get(item.remote.id);
              return refreshed
                ? { ...item, remote: refreshed, phase: "ready" as const }
                : item;
            });
          });
        });
        return;
      }

      patchItem(localId, { phase: "processing" });
      try {
        const result = await finalizeScannedUploadPreviewAction(
          submissionId,
          blockId,
          { combineImagesToPdf: true },
        );
        if (result.error) {
          // Original is safe — do not fail the upload.
          patchItem(localId, {
            phase: "ready",
            error: null,
          });
          return;
        }
        if (result.files) {
          setItems((prev) => {
            const byId = new Map(result.files!.map((f) => [f.id, f]));
            const next = prev.map((item) => {
              if (!item.remote) return item;
              const refreshed = byId.get(item.remote.id);
              if (!refreshed) return item;
              return {
                ...item,
                remote: refreshed,
                phase: "ready" as const,
              };
            });
            notifySummary(next);
            return next;
          });
        } else {
          patchItem(localId, { phase: "ready" });
        }
      } catch {
        patchItem(localId, { phase: "ready" });
      }
    },
    [
      blockId,
      config.combine_images_to_pdf,
      notifySummary,
      patchItem,
      submissionId,
    ],
  );

  const uploadLocalItem = useCallback(
    async (localId: string, file: File, displayOrder: number) => {
      const startTimer = startWatchersRef.current.get(localId);
      if (startTimer) {
        window.clearTimeout(startTimer);
        startWatchersRef.current.delete(localId);
      }

      const abort = new AbortController();
      patchItem(localId, {
        phase: "uploading",
        progress: 0,
        error: null,
        abort,
      });

      let lastProgressAt = Date.now();
      const stallTimer = window.setInterval(() => {
        if (Date.now() - lastProgressAt > STALL_MS) {
          patchItem(localId, {
            phase: "stalled",
            error:
              "No upload progress for 20 seconds. Check your connection and retry.",
          });
          abort.abort();
          window.clearInterval(stallTimer);
        }
      }, 2_000);

      const hardTimeout = window.setTimeout(() => {
        abort.abort();
        patchItem(localId, {
          phase: "error",
          error: "The upload timed out. Please retry.",
        });
      }, UPLOAD_TIMEOUT_MS);

      try {
        if (!mountedRef.current) return;
        const prepared = await prepareScannedUploadAction({
          submissionId,
          blockId,
          questionId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          displayOrder,
        });
        if (prepared.error || !prepared.prepared) {
          patchItem(localId, {
            phase: "error",
            error:
              prepared.error ??
              "The file could not be uploaded to storage. Please retry.",
          });
          return;
        }

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
            patchItem(localId, { progress: pct, phase: "uploading" });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Storage upload failed (${xhr.status})`));
            }
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

        patchItem(localId, { progress: 100, phase: "uploaded" });

        const confirmed = await confirmScannedUploadAction({
          submissionId,
          blockId,
          questionId,
          fileId: prepared.prepared.fileId,
          storagePath: prepared.prepared.storagePath,
          originalFileName: prepared.prepared.originalFileName,
          mimeType: prepared.prepared.mimeType,
          fileSize: prepared.prepared.fileSize,
          displayOrder: prepared.prepared.displayOrder,
          submissionVersion: prepared.prepared.submissionVersion,
        });
        if (confirmed.error || !confirmed.file) {
          patchItem(localId, {
            phase: "error",
            error:
              confirmed.error ??
              "The upload completed, but the file record could not be saved.",
          });
          return;
        }

        pendingFilesRef.current.delete(localId);
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null;
        patchItem(localId, {
          phase: "uploaded",
          progress: 100,
          remote: confirmed.file,
          localId: confirmed.file.id,
          file: null,
          previewUrl,
          abort: null,
          error: null,
        });

        void runPreviewInBackground(
          confirmed.file.id,
          confirmed.file.mime_type,
        );
      } catch (err) {
        if (abort.signal.aborted) {
          const item = itemsRef.current.find((i) => i.localId === localId);
          if (item?.phase === "stalled") return;
          patchItem(localId, {
            phase: "error",
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
          : /type|mime|accepted/i.test(message)
            ? "This file type is not accepted."
            : /size|large|limit|too big/i.test(message)
              ? `The file is larger than the ${formatBytes(config.maximum_file_size_bytes)} limit.`
              : "The file could not be uploaded to storage. Please retry.";
        patchItem(localId, { phase: "error", error: friendly, abort: null });
      } finally {
        window.clearInterval(stallTimer);
        window.clearTimeout(hardTimeout);
        releaseUploadJob(queueStateRef.current, localId);
        pumpQueueRef.current();
      }
    },
    [
      blockId,
      config.maximum_file_size_bytes,
      patchItem,
      questionId,
      runPreviewInBackground,
      submissionId,
    ],
  );

  const pumpQueue = useCallback(() => {
    if (!mountedRef.current) return;
    const started = takeNextUploadJobs(queueStateRef.current);
    for (const localId of started) {
      const file =
        pendingFilesRef.current.get(localId) ??
        itemsRef.current.find((i) => i.localId === localId)?.file ??
        null;
      const order =
        itemsRef.current.find((i) => i.localId === localId)?.order ?? 0;
      if (!file) {
        // Should not happen when pendingFilesRef is filled first — release lock.
        requeueUploadJob(queueStateRef.current, localId);
        patchItem(localId, {
          phase: "error",
          error: "The upload could not start. Retry.",
        });
        continue;
      }
      void uploadLocalItem(localId, file, order);
    }
  }, [patchItem, uploadLocalItem]);

  useEffect(() => {
    pumpQueueRef.current = pumpQueue;
  }, [pumpQueue]);

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

  function armStartTimeout(localId: string) {
    const existing = startWatchersRef.current.get(localId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      startWatchersRef.current.delete(localId);
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (!item || item.phase !== "queued") return;
      patchItem(localId, {
        phase: "error",
        error: "The upload could not start. Retry.",
      });
      queueStateRef.current.queue = queueStateRef.current.queue.filter(
        (id) => id !== localId,
      );
      releaseUploadJob(queueStateRef.current, localId);
      pumpQueueRef.current();
    }, SCANNED_UPLOAD_START_TIMEOUT_MS);
    startWatchersRef.current.set(localId, timer);
  }

  async function onFilesSelected(list: FileList | null) {
    if (!list?.length || !editable) return;
    setGlobalError(null);
    const existingCount = itemsRef.current.filter(
      (i) => i.phase !== "error",
    ).length;
    const remaining = config.maximum_files - existingCount;
    if (remaining <= 0) {
      setGlobalError(
        `You can upload at most ${config.maximum_files} file(s).`,
      );
      return;
    }
    const batch = Array.from(list).slice(0, remaining);
    const additions: LocalUploadItem[] = [];
    const now = Date.now();
    let order = existingCount;
    for (const file of batch) {
      const validationError = validateFile(file);
      const localId = crypto.randomUUID();
      additions.push({
        localId,
        file: validationError ? null : file,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        order,
        phase: validationError ? "error" : "queued",
        progress: 0,
        error: validationError,
        remote: null,
        abort: null,
        previewUrl:
          !validationError && file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
        queuedAt: now,
      });
      if (!validationError) {
        // File bytes live in a ref so the worker never waits on React state.
        pendingFilesRef.current.set(localId, file);
        queueStateRef.current.queue.push(localId);
        armStartTimeout(localId);
      }
      order += 1;
    }
    syncItems((prev) => {
      const next = [...prev, ...additions];
      notifySummary(next);
      return next;
    });
    // Start immediately — do not wait for another render or autosave.
    pumpQueue();
  }

  async function retryItem(localId: string) {
    const item = itemsRef.current.find((i) => i.localId === localId);
    if (!item) return;
    if (!item.file && item.remote) {
      await reloadFromServer();
      return;
    }
    const file = item.file ?? pendingFilesRef.current.get(localId) ?? null;
    if (!file) {
      setGlobalError("Select the file again to retry this upload.");
      return;
    }
    pendingFilesRef.current.set(localId, file);
    patchItem(localId, {
      phase: "queued",
      progress: 0,
      error: null,
      file,
      queuedAt: Date.now(),
    });
    if (!queueStateRef.current.queue.includes(localId)) {
      queueStateRef.current.queue.push(localId);
    }
    armStartTimeout(localId);
    pumpQueueRef.current();
  }

  async function cancelItem(localId: string) {
    const item = itemsRef.current.find((i) => i.localId === localId);
    item?.abort?.abort();
    pendingFilesRef.current.delete(localId);
    queueStateRef.current.queue = queueStateRef.current.queue.filter(
      (id) => id !== localId,
    );
    releaseUploadJob(queueStateRef.current, localId);
    const startTimer = startWatchersRef.current.get(localId);
    if (startTimer) {
      window.clearTimeout(startTimer);
      startWatchersRef.current.delete(localId);
    }
    syncItems((prev) => {
      const next = prev.filter((i) => i.localId !== localId);
      notifySummary(next);
      return next;
    });
    pumpQueueRef.current();
  }

  async function replaceAll() {
    if (!editable || !config.allow_replacement) return;
    setGlobalError(null);
    const result = await replaceScannedUploadSetAction(submissionId, blockId);
    if (result.error) {
      setGlobalError(result.error);
      return;
    }
    queueStateRef.current = {
      queue: [],
      activeCount: 0,
      inFlight: new Set(),
    };
    pendingFilesRef.current.clear();
    syncItems(() => []);
    onFilesChanged?.({ file_count: 0, file_names: [] });
  }

  const typesLabel = [
    config.allow_pdf ? "PDF" : null,
    config.allow_images ? "JPG, JPEG, PNG" : null,
    config.allow_docx ? "DOCX" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const hasVisibleItems = items.length > 0;

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

      {editable ? (
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
            void onFilesSelected(e.dataTransfer.files);
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
                void onFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {editable && items.some((i) => i.remote) && config.allow_replacement ? (
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
            key={item.localId}
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
                    item.phase === "error" || item.phase === "stalled"
                      ? "text-rose-700"
                      : item.phase === "ready"
                        ? "text-emerald-700"
                        : "text-slate-600"
                  }
                >
                  {scannedUploadPhaseLabel(item.phase, item.progress)}
                </span>
                {item.remote?.page_count
                  ? ` · ${item.remote.page_count} page(s)`
                  : ""}
              </p>
              {item.phase === "uploading" ? (
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
                {item.phase === "uploading" || item.phase === "queued" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void cancelItem(item.localId)}
                  >
                    Cancel
                  </Button>
                ) : null}
                {item.phase === "error" || item.phase === "stalled" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void retryItem(item.localId)}
                  >
                    Retry
                  </Button>
                ) : null}
                {item.remote &&
                item.phase !== "uploading" &&
                item.phase !== "queued" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() =>
                        void (async () => {
                          const prev = items[index - 1];
                          if (!prev?.remote || !item.remote) return;
                          await updateScannedUploadFileAction(item.remote.id, {
                            display_order: prev.remote!.display_order,
                          });
                          await updateScannedUploadFileAction(prev.remote.id, {
                            display_order: item.remote.display_order,
                          });
                          await reloadFromServer();
                          void finalizeScannedUploadPreviewAction(
                            submissionId,
                            blockId,
                            { combineImagesToPdf: config.combine_images_to_pdf },
                          );
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
                          if (!next?.remote || !item.remote) return;
                          await updateScannedUploadFileAction(item.remote.id, {
                            display_order: next.remote!.display_order,
                          });
                          await updateScannedUploadFileAction(next.remote.id, {
                            display_order: item.remote.display_order,
                          });
                          await reloadFromServer();
                          void finalizeScannedUploadPreviewAction(
                            submissionId,
                            blockId,
                            { combineImagesToPdf: config.combine_images_to_pdf },
                          );
                        })()
                      }
                    >
                      Down
                    </Button>
                    {item.mimeType.startsWith("image/") ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void (async () => {
                            if (!item.remote) return;
                            await updateScannedUploadFileAction(item.remote.id, {
                              rotation: (item.remote.rotation + 90) % 360,
                            });
                            await reloadFromServer();
                            void finalizeScannedUploadPreviewAction(
                              submissionId,
                              blockId,
                              {
                                combineImagesToPdf: config.combine_images_to_pdf,
                              },
                            );
                          })()
                        }
                      >
                        Rotate
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void (async () => {
                          if (!item.remote) return;
                          await removeScannedUploadFileAction(item.remote.id);
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

      {!hasVisibleItems ? (
        <p className="text-xs text-slate-500">
          {editable ? "No files uploaded yet." : "No file submitted."}
        </p>
      ) : null}
    </div>
  );
}
