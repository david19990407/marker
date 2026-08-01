"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/shared/download-button";

type ViewerKind = "pdf" | "image" | "docx" | "unsupported";
type StorageBucket =
  | "student-submissions"
  | "assignment-resources"
  | "marking-stamps";

function detectKind(fileName: string): ViewerKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "image";
  if (/\.(docx?|rtf)$/.test(lower)) return "docx";
  return "unsupported";
}

export function FileViewer({
  fileName,
  storagePath,
  bucket = "student-submissions",
  zoom,
  fit,
  onPageCount,
}: {
  fileName: string;
  storagePath: string;
  bucket?: StorageBucket;
  zoom: number;
  fit: "width" | "page" | "none";
  onPageCount?: (pages: number) => void;
}) {
  const kind = detectKind(fileName);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [docxFailed, setDocxFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setUrl(null);
      setDocxFailed(false);
      try {
        const res = await fetch("/api/files/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket, path: storagePath }),
        });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          if (!cancelled) setError(json.error ?? "Unable to open file");
          return;
        }
        if (!cancelled) setUrl(json.url);
      } catch {
        if (!cancelled) setError("Unable to open file");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath]);

  useEffect(() => {
    onPageCount?.(kind === "pdf" ? Math.max(page, 1) : 1);
  }, [kind, onPageCount, page]);

  const scale =
    fit === "width" ? 1 : fit === "page" ? 0.85 : Math.max(0.4, zoom);

  return (
    <div className="flex h-full flex-col bg-slate-200/70">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        <span className="truncate font-medium text-slate-700">{fileName}</span>
        <div className="flex items-center gap-2">
          {kind === "pdf" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev page
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </Button>
            </>
          ) : null}
          <DownloadButton bucket={bucket} path={storagePath} />
        </div>
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <p className="mb-2 font-medium text-slate-800">Preview unavailable</p>
            <p className="mb-3">{error}</p>
            <DownloadButton bucket={bucket} path={storagePath} />
          </div>
        ) : null}

        {!error && !url ? (
          <p className="text-sm text-slate-500">Loading preview…</p>
        ) : null}

        {url && kind === "pdf" ? (
          <iframe
            title={fileName}
            src={`${url}#page=${page}`}
            className="mx-auto min-h-[70vh] w-full max-w-4xl rounded-sm bg-white shadow-lg"
            style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
          />
        ) : null}

        {url && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={fileName}
            className="mx-auto max-w-full rounded-sm bg-white shadow-lg"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top center",
            }}
          />
        ) : null}

        {url && kind === "docx" ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow">
            <p className="mb-2 font-medium text-slate-800">DOCX preview</p>
            <p className="mb-3">
              In-browser DOCX rendering is a best-effort fallback and may not be
              pixel-perfect. The original file is preserved unchanged.
            </p>
            {!docxFailed ? (
              <iframe
                title={`${fileName} preview`}
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                className="min-h-[60vh] w-full rounded border border-slate-100"
                onError={() => setDocxFailed(true)}
              />
            ) : (
              <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                Embedded preview failed. Download the original file instead.
              </p>
            )}
            <div className="mt-3">
              <DownloadButton bucket={bucket} path={storagePath} />
            </div>
          </div>
        ) : null}

        {url && kind === "unsupported" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm">
            <p className="mb-2 font-medium">
              Preview not supported for this file type.
            </p>
            <DownloadButton bucket={bucket} path={storagePath} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
