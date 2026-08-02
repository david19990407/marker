"use client";

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
  if (!annotations.length) {
    return (
      <p className="text-sm text-slate-500">
        No annotations were released with this feedback.
      </p>
    );
  }

  const stampMap = new Map(stamps.map((s) => [s.id, s]));

  return (
    <div className="relative min-h-[12rem] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
      <div className="relative mx-auto min-h-[12rem] max-w-3xl bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Teacher annotations
        </p>
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
        <div className="pointer-events-none absolute inset-0">
          {annotations.map((annotation) => (
            <div
              key={`pos-${annotation.id}`}
              className="absolute rounded-sm border border-rose-300/40"
              style={{
                ...annotationStyle(annotation),
                backgroundColor:
                  annotation.annotation_type === "stamp"
                    ? "transparent"
                    : annotation.colour,
                opacity:
                  annotation.annotation_type === "stamp"
                    ? 1
                    : Math.min(annotation.opacity, 0.35),
              }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
