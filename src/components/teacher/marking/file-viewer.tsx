"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/shared/download-button";
import { normaliseStorageObjectPath } from "@/lib/homework/scanned-file-resolve";

type ViewerKind = "pdf" | "image" | "docx" | "unsupported";
type StorageBucket =
  | "student-submissions"
  | "assignment-resources"
  | "marking-stamps";

function detectKind(fileName: string, storagePath: string): ViewerKind {
  const lower = `${fileName} ${storagePath}`.toLowerCase();
  if (lower.includes(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg)(\b|$)/.test(lower)) return "image";
  if (/\.(docx?|rtf)(\b|$)/.test(lower)) return "docx";
  return "unsupported";
}

async function requestSignedUrl(
  bucket: string,
  path: string,
): Promise<{ url?: string; error?: string; missing?: boolean }> {
  const res = await fetch("/api/files/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });
  const json = (await res.json()) as {
    url?: string;
    error?: string;
    missing?: boolean;
  };
  if (!res.ok || !json.url) {
    return {
      error: json.error ?? "Unable to open file",
      missing: Boolean(json.missing) || /object not found|not found/i.test(json.error ?? ""),
    };
  }
  return { url: json.url };
}

export function FileViewer({
  fileName,
  storagePath,
  bucket = "student-submissions",
  zoom,
  fit,
  onPageCount,
  onPageChange,
  pageNumber = 1,
  rotation = 0,
  downloadPath,
}: {
  fileName: string;
  storagePath: string;
  bucket?: StorageBucket;
  zoom: number;
  fit: "width" | "page" | "none";
  onPageCount?: (pages: number) => void;
  onPageChange?: (page: number) => void;
  pageNumber?: number;
  rotation?: number;
  /** Optional path for Download original (defaults to storagePath). */
  downloadPath?: string | null;
}) {
  const path = normaliseStorageObjectPath(storagePath, bucket);
  const dlPath = normaliseStorageObjectPath(
    downloadPath || storagePath,
    bucket,
  );
  const kind = detectKind(fileName, path);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingObject, setMissingObject] = useState(false);
  const [localPage, setLocalPage] = useState(Math.max(1, pageNumber));
  const page =
    typeof pageNumber === "number" && pageNumber > 0
      ? Math.max(1, pageNumber)
      : localPage;
  const [docxFailed, setDocxFailed] = useState(false);
  const knownMissingRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const key = `${bucket}:${path}`;
      if (!opts?.force && knownMissingRef.current === key) {
        setMissingObject(true);
        setError("The submitted file could not be found in storage");
        return;
      }
      const token = ++loadTokenRef.current;
      setError(null);
      setUrl(null);
      setDocxFailed(false);
      setMissingObject(false);

      let result = await requestSignedUrl(bucket, path);
      // Retry once with a fresh signed URL request.
      if (!result.url) {
        result = await requestSignedUrl(bucket, path);
      }
      if (token !== loadTokenRef.current) return;

      if (!result.url) {
        if (result.missing) {
          knownMissingRef.current = key;
          setMissingObject(true);
          setError("The submitted file could not be found in storage");
          console.error("[file-viewer] storage object missing", {
            bucket,
            path,
            fileName,
          });
        } else {
          setError(result.error ?? "Unable to open file");
        }
        return;
      }
      knownMissingRef.current = null;
      setUrl(result.url);
    },
    [bucket, fileName, path],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onPageCount?.(kind === "pdf" ? Math.max(page, 1) : 1);
  }, [kind, onPageCount, page]);

  function changePage(next: number) {
    const safe = Math.max(1, next);
    setLocalPage(safe);
    onPageChange?.(safe);
  }

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
                onClick={() => changePage(page - 1)}
              >
                Prev page
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => changePage(page + 1)}
              >
                Next page
              </Button>
            </>
          ) : null}
          <DownloadButton bucket={bucket} path={dlPath} />
        </div>
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <p className="mb-1 font-medium text-slate-800">{fileName}</p>
            <p className="mb-3">
              {missingObject
                ? "The submitted file could not be found in storage"
                : error}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  knownMissingRef.current = null;
                  void load({ force: true });
                }}
              >
                Retry
              </Button>
              {!missingObject ? (
                <DownloadButton bucket={bucket} path={dlPath} />
              ) : null}
            </div>
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
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top center",
            }}
          />
        ) : null}

        {url && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={fileName}
            className="mx-auto max-w-full rounded-sm bg-white shadow-lg"
            style={{
              transform: `scale(${scale}) rotate(${rotation || 0}deg)`,
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
              <DownloadButton bucket={bucket} path={path} />
            </div>
          </div>
        ) : null}

        {url && kind === "unsupported" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm">
            <p className="mb-2 font-medium">
              Preview not supported for this file type.
            </p>
            <DownloadButton bucket={bucket} path={path} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
