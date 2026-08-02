"use client";

import { useEffect, useMemo, useState } from "react";
import { StampImage } from "@/components/shared/stamp-image";
import { annotationStyle } from "@/lib/marking/annotation-types";
import type { SubmissionAnnotation } from "@/lib/marking/annotation-types";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

/** Read-only overlay of student-visible annotations after feedback release. */
export function ReleasedAnnotationsPanel({
  annotations,
  stamps,
}: {
  annotations: SubmissionAnnotation[];
  stamps: MarkingStamp[];
}) {
  const stampMap = useMemo(
    () => new Map(stamps.map((s) => [s.id, s])),
    [stamps],
  );
  const scriptPath = useMemo(() => {
    const withPath = annotations.find(
      (a) => a.target_kind !== "worksheet" && a.target_path,
    );
    return withPath?.target_path ?? null;
  }, [annotations]);
  const scriptName = useMemo(() => {
    if (!scriptPath) return null;
    const parts = scriptPath.split("/");
    return parts[parts.length - 1] || "Submitted script";
  }, [scriptPath]);

  const [scriptUrl, setScriptUrl] = useState<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!scriptPath) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/files/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket: "student-submissions",
            path: scriptPath,
          }),
        });
        const json = (await res.json()) as { url?: string };
        if (!cancelled) {
          setScriptUrl(json.url ?? null);
          setLoadedPath(scriptPath);
        }
      } catch {
        if (!cancelled) {
          setScriptUrl(null);
          setLoadedPath(scriptPath);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scriptPath]);

  const activeScriptUrl = loadedPath === scriptPath ? scriptUrl : null;

  if (!annotations.length) {
    return (
      <p className="text-sm text-slate-500">
        No annotations were released with this feedback.
      </p>
    );
  }

  const isPdf =
    !!scriptPath &&
    (scriptPath.toLowerCase().endsWith(".pdf") ||
      !!scriptName?.toLowerCase().endsWith(".pdf"));
  const isImage =
    !!scriptPath &&
    /\.(png|jpe?g|gif|webp)$/i.test(scriptPath || scriptName || "");

  return (
    <div className="space-y-4">
      <div className="relative min-h-[16rem] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
        <div className="relative mx-auto min-h-[16rem] max-w-3xl bg-white p-4 shadow-sm">
          {activeScriptUrl && isPdf ? (
            <iframe
              title={scriptName ?? "Submitted script"}
              src={activeScriptUrl}
              className="mb-4 min-h-[60vh] w-full rounded border border-slate-100 bg-white"
            />
          ) : null}
          {activeScriptUrl && isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeScriptUrl}
              alt={scriptName ?? "Submitted script"}
              className="mb-4 mx-auto max-h-[70vh] max-w-full rounded border border-slate-100 bg-white"
            />
          ) : null}
          {!activeScriptUrl && scriptPath ? (
            <p className="mb-4 text-xs text-slate-500">
              Loading submitted script…
            </p>
          ) : null}
          {!scriptPath ? (
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Teacher annotations
            </p>
          ) : (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Annotated script
            </p>
          )}

          <div className="pointer-events-none absolute inset-0">
            {annotations.map((annotation) => (
              <div
                key={`pos-${annotation.id}`}
                className="absolute rounded-sm"
                style={{
                  ...annotationStyle(annotation),
                  border:
                    annotation.annotation_type === "area_comment"
                      ? `1.5px solid ${annotation.colour || "#dc2626"}`
                      : "none",
                  backgroundColor:
                    annotation.annotation_type === "stamp"
                      ? "transparent"
                      : annotation.annotation_type === "area_comment"
                        ? "#ffffff"
                        : annotation.colour,
                  opacity:
                    annotation.annotation_type === "stamp"
                      ? Number(
                          annotation.geometry?.opacity_snapshot ??
                            annotation.opacity ??
                            1,
                        )
                      : annotation.annotation_type === "area_comment"
                      : annotation.annotation_type === "area_comment" ||
                          annotation.annotation_type === "text_comment"
                        ? 1
                        : Math.min(annotation.opacity, 0.35),
                }}
                aria-hidden
              >
                {annotation.annotation_type === "stamp" ? (
                  <StampImage
                    stamp={
                      annotation.stamp_id
                        ? stampMap.get(annotation.stamp_id)
                        : null
                    }
                    geometry={annotation.geometry}
                    alt={
                      (typeof annotation.geometry?.accessible_label_snapshot ===
                      "string"
                        ? annotation.geometry.accessible_label_snapshot
                        : null) ||
                      stampMap.get(annotation.stamp_id ?? "")?.accessible_label ||
                      "Stamp"
                    }
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="space-y-2 text-sm text-slate-600">
        {annotations.map((annotation) => {
          const stamp = annotation.stamp_id
            ? stampMap.get(annotation.stamp_id)
            : null;
          return (
            <li
              key={annotation.id}
              className="rounded-xl border border-slate-100 px-3 py-2"
            >
              <span className="font-medium capitalize text-slate-800">
                {annotation.annotation_type.replaceAll("_", " ")}
              </span>
              {annotation.page_number ? (
                <span className="ml-2 text-xs text-slate-400">
                  Page {annotation.page_number}
                </span>
              ) : null}
              {annotation.text_content ? (
                <p className="mt-1 whitespace-pre-wrap">
                  {annotation.text_content}
                </p>
              ) : null}
              {stamp || annotation.annotation_type === "stamp" ? (
                <div className="mt-2 flex items-center gap-2">
                  <StampImage
                    stamp={stamp}
                    geometry={annotation.geometry}
                    alt={
                      (typeof annotation.geometry?.accessible_label_snapshot ===
                      "string"
                        ? annotation.geometry.accessible_label_snapshot
                        : null) ||
                      stamp?.accessible_label ||
                      "Stamp"
                    }
                    className="h-8 w-8 object-contain"
                  />
                  <span className="text-xs text-slate-500">
                    {(typeof annotation.geometry?.stamp_name_snapshot ===
                    "string"
                      ? annotation.geometry.stamp_name_snapshot
                      : null) ||
                      stamp?.accessible_label ||
                      "Stamp"}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
