"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  listScannedUploadFilesAction,
  removeScannedUploadFileAction,
  updateScannedUploadFileAction,
  uploadScannedHomeworkFileAction,
  type ScannedUploadFileRow,
} from "@/lib/actions/scanned-uploads";
import type { ScannedUploadConfig } from "@/lib/types";

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
}) {
  const [files, setFiles] = useState<ScannedUploadFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "saved" | "error">(
    "idle",
  );
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  const reload = useCallback(() => {
    startTransition(async () => {
      const result = await listScannedUploadFilesAction(submissionId, blockId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const next = result.files ?? [];
      setFiles(next);
      onFilesChanged?.({
        file_count: next.length,
        file_names: next.map((f) => f.original_file_name),
      });
    });
  }, [submissionId, blockId, onFilesChanged]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function uploadOne(file: File, order: number) {
    if (file.size > config.maximum_file_size_bytes) {
      setError(
        `“${file.name}” exceeds the maximum size of ${formatBytes(config.maximum_file_size_bytes)}.`,
      );
      setStatus("error");
      return;
    }
    if (
      config.allowed_mime_types.length &&
      !config.allowed_mime_types.includes(file.type) &&
      !(config.allow_images && file.type.startsWith("image/")) &&
      !(config.allow_pdf && file.type === "application/pdf")
    ) {
      setError(`“${file.name}” is not an allowed file type.`);
      setStatus("error");
      return;
    }
    setStatus("uploading");
    setError(null);
    const fd = new FormData();
    fd.set("submission_id", submissionId);
    fd.set("block_id", blockId);
    if (questionId) fd.set("question_id", questionId);
    fd.set("display_order", String(order));
    fd.set("file", file);
    const result = await uploadScannedHomeworkFileAction(fd);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("saved");
    reload();
  }

  async function onFilesSelected(list: FileList | null) {
    if (!list?.length || !editable) return;
    const remaining = config.maximum_files - files.length;
    if (remaining <= 0) {
      setError(`You can upload at most ${config.maximum_files} file(s).`);
      setStatus("error");
      return;
    }
    const batch = Array.from(list).slice(0, remaining);
    let order = files.length;
    for (const file of batch) {
      await uploadOne(file, order);
      order += 1;
    }
  }

  const typesLabel = [
    config.allow_pdf ? "PDF" : null,
    config.allow_images ? "JPG, JPEG, PNG" : null,
    config.allow_docx ? "DOCX" : null,
  ]
    .filter(Boolean)
    .join(", ");

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

      {status === "uploading" || pending ? (
        <p className="text-xs text-slate-500">Uploading…</p>
      ) : status === "saved" ? (
        <p className="text-xs text-emerald-700">Saved</p>
      ) : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}

      <ul className="space-y-2">
        {files.map((file, index) => (
          <li
            key={file.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {file.original_file_name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.file_size)}
                {file.page_count ? ` · ${file.page_count} page(s)` : ""}
                {file.rotation ? ` · rotated ${file.rotation}°` : ""}
              </p>
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={index === 0}
                  onClick={() =>
                    startTransition(async () => {
                      const prev = files[index - 1];
                      if (!prev) return;
                      await updateScannedUploadFileAction(file.id, {
                        display_order: prev.display_order,
                      });
                      await updateScannedUploadFileAction(prev.id, {
                        display_order: file.display_order,
                      });
                      reload();
                    })
                  }
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={index === files.length - 1}
                  onClick={() =>
                    startTransition(async () => {
                      const next = files[index + 1];
                      if (!next) return;
                      await updateScannedUploadFileAction(file.id, {
                        display_order: next.display_order,
                      });
                      await updateScannedUploadFileAction(next.id, {
                        display_order: file.display_order,
                      });
                      reload();
                    })
                  }
                >
                  Down
                </Button>
                {file.mime_type.startsWith("image/") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      startTransition(async () => {
                        await updateScannedUploadFileAction(file.id, {
                          rotation: (file.rotation + 90) % 360,
                        });
                        reload();
                      })
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
                    startTransition(async () => {
                      await removeScannedUploadFileAction(file.id);
                      reload();
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {!files.length ? (
        <p className="text-xs text-slate-500">
          {editable ? "No files uploaded yet." : "No file submitted."}
        </p>
      ) : null}
    </div>
  );
}
