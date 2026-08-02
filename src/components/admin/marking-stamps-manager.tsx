"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StampImage } from "@/components/shared/stamp-image";
import {
  archiveMarkingStampAction,
  deleteUnusedMarkingStampAction,
  hideMarkingStampFromPaletteAction,
  reorderMarkingStampAction,
  replaceMarkingStampImageAction,
  restoreMarkingStampToPaletteAction,
  updateMarkingStampAction,
  uploadMarkingStampAction,
} from "@/lib/actions/marking-stamps";
import type { ActionResult } from "@/lib/actions/auth";
import type { MarkingStamp } from "@/lib/marking/annotation-types";

type UploadState = ActionResult & { stamp?: MarkingStamp };
const initial: UploadState = {};

type ConfirmState =
  | null
  | {
      kind: "hide" | "archive" | "delete" | "delete-blocked";
      stamp: MarkingStamp;
      message: string;
      error?: string;
      busy?: boolean;
    };

type EditState = {
  stamp: MarkingStamp;
  name: string;
  accessible_label: string;
  category: string;
  default_width_px: number;
  default_height_px: number;
  default_size_pct: number;
  sort_order: number;
  subject_restriction: string;
  is_active: boolean;
  is_palette_visible: boolean;
  archived: boolean;
  previewUrl: string | null;
  file: File | null;
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
};

function stampStatus(stamp: MarkingStamp): "Active" | "Hidden" | "Archived" {
  if (stamp.archived_at) return "Archived";
  if (!stamp.is_palette_visible || !stamp.is_active) return "Hidden";
  return "Active";
}

function restrictionSummary(stamp: MarkingStamp): string {
  const parts: string[] = [];
  if (stamp.subject_restriction) parts.push(stamp.subject_restriction);
  if (stamp.teacher_restriction_ids.length) {
    parts.push(`${stamp.teacher_restriction_ids.length} teachers`);
  }
  if (stamp.assignment_restriction_ids.length) {
    parts.push(`${stamp.assignment_restriction_ids.length} assignments`);
  }
  return parts.length ? parts.join(" · ") : "No restrictions";
}

export function MarkingStampsManager({
  stamps: initialStamps,
  subjects,
}: {
  stamps: MarkingStamp[];
  subjects: string[];
}) {
  const [stamps, setStamps] = useState(initialStamps);
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadMarkingStampAction,
    initial,
  );
  const [, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const list =
      state.stamp && !stamps.some((s) => s.id === state.stamp!.id)
        ? [...stamps, state.stamp]
        : stamps;
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
  }, [stamps, state.stamp]);

  function openEdit(stamp: MarkingStamp) {
    setMenuOpenId(null);
    setEdit({
      stamp,
      name: stamp.name,
      accessible_label: stamp.accessible_label,
      category: stamp.category,
      default_width_px: stamp.default_width_px || 64,
      default_height_px: stamp.default_height_px || 64,
      default_size_pct: stamp.default_size_pct || 8,
      sort_order: stamp.sort_order,
      subject_restriction: stamp.subject_restriction ?? "",
      is_active: stamp.is_active,
      is_palette_visible: stamp.is_palette_visible,
      archived: Boolean(stamp.archived_at),
      previewUrl: null,
      file: null,
      status: "idle",
      error: null,
    });
  }

  async function saveEdit() {
    if (!edit) return;
    setEdit((prev) =>
      prev ? { ...prev, status: "saving", error: null } : prev,
    );
    const patch = {
      name: edit.name.trim(),
      accessible_label: edit.accessible_label.trim(),
      category: edit.category.trim() || "general",
      default_width_px: edit.default_width_px,
      default_height_px: edit.default_height_px,
      default_size_pct: edit.default_size_pct,
      sort_order: edit.sort_order,
      subject_restriction: edit.subject_restriction.trim() || null,
      is_active: edit.archived ? false : edit.is_active,
      is_palette_visible: edit.archived ? false : edit.is_palette_visible,
      archived_at: edit.archived ? edit.stamp.archived_at ?? new Date().toISOString() : null,
    };
    if (!patch.name || !patch.accessible_label) {
      setEdit((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              error: "Name and accessible label are required",
            }
          : prev,
      );
      return;
    }

    const result = await updateMarkingStampAction(edit.stamp.id, patch);
    if (result.error) {
      setEdit((prev) =>
        prev
          ? { ...prev, status: "error", error: result.error ?? "Save failed" }
          : prev,
      );
      return;
    }

    if (edit.file) {
      const fd = new FormData();
      fd.set("file", edit.file);
      fd.set("default_width_px", String(edit.default_width_px));
      fd.set("default_height_px", String(edit.default_height_px));
      const imageResult = await replaceMarkingStampImageAction(
        edit.stamp.id,
        fd,
      );
      if (imageResult.error) {
        setEdit((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                error: imageResult.error ?? "Image replace failed",
              }
            : prev,
        );
        if (result.stamp) {
          setStamps((prev) =>
            prev.map((s) => (s.id === result.stamp!.id ? result.stamp! : s)),
          );
        }
        return;
      }
      if (imageResult.stamp) {
        setStamps((prev) =>
          prev.map((s) =>
            s.id === imageResult.stamp!.id ? imageResult.stamp! : s,
          ),
        );
      }
    } else if (result.stamp) {
      setStamps((prev) =>
        prev.map((s) => (s.id === result.stamp!.id ? result.stamp! : s)),
      );
    }

    setEdit((prev) =>
      prev ? { ...prev, status: "saved", error: null, file: null } : prev,
    );
    window.setTimeout(() => setEdit(null), 450);
  }

  function runConfirm() {
    if (!confirm) return;
    const { kind, stamp } = confirm;
    setConfirm({ ...confirm, busy: true, error: undefined });
    startTransition(async () => {
      if (kind === "hide" || kind === "delete-blocked") {
        const result = await hideMarkingStampFromPaletteAction(stamp.id);
        if (result.error) {
          setConfirm((prev) =>
            prev ? { ...prev, busy: false, error: result.error } : prev,
          );
          return;
        }
        if (result.stamp) {
          setStamps((prev) =>
            prev.map((s) => (s.id === result.stamp!.id ? result.stamp! : s)),
          );
        } else {
          setStamps((prev) =>
            prev.map((s) =>
              s.id === stamp.id
                ? { ...s, is_palette_visible: false, is_active: true }
                : s,
            ),
          );
        }
        setConfirm(null);
        return;
      }
      if (kind === "archive") {
        const result = await archiveMarkingStampAction(stamp.id);
        if (result.error) {
          setConfirm((prev) =>
            prev ? { ...prev, busy: false, error: result.error } : prev,
          );
          return;
        }
        if (result.stamp) {
          setStamps((prev) =>
            prev.map((s) => (s.id === result.stamp!.id ? result.stamp! : s)),
          );
        }
        setConfirm(null);
        return;
      }
      if (kind === "delete") {
        const result = await deleteUnusedMarkingStampAction(stamp.id);
        if (result.blocked) {
          setConfirm({
            kind: "delete-blocked",
            stamp,
            message:
              result.error ??
              "This stamp has been used on existing work. You can remove it from the annotation palette while preserving the copies already placed on student scripts.",
            busy: false,
          });
          return;
        }
        if (result.error) {
          setConfirm((prev) =>
            prev ? { ...prev, busy: false, error: result.error } : prev,
          );
          return;
        }
        setStamps((prev) => prev.filter((s) => s.id !== stamp.id));
        setConfirm(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-4 rounded-2xl border border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Upload stamp</h3>
        {state.error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Name</span>
            <Input name="name" required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Accessible label</span>
            <Input name="accessible_label" required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Category</span>
            <Input name="category" defaultValue="general" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Default size (%)</span>
            <Input
              name="default_size_pct"
              type="number"
              min={2}
              max={40}
              defaultValue={8}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Default width (px)</span>
            <Input name="default_width_px" type="number" min={16} max={512} defaultValue={64} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Default height (px)</span>
            <Input name="default_height_px" type="number" min={16} max={512} defaultValue={64} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-500">
              Subject restriction (optional)
            </span>
            <select
              name="subject_restriction"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              defaultValue=""
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-500">
              Image (PNG, SVG or WebP, max 2MB)
            </span>
            <Input
              name="file"
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              required
            />
          </label>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload stamp"}
        </Button>
      </form>

      <ul className="space-y-3">
        {ordered.map((stamp, index) => {
          const status = stampStatus(stamp);
          return (
            <li
              key={stamp.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50">
                <StampImage
                  storagePath={stamp.storage_path}
                  alt={stamp.accessible_label}
                  className="max-h-10 max-w-10 object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {stamp.name}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      status === "Active"
                        ? "bg-emerald-50 text-emerald-800"
                        : status === "Hidden"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {status}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {stamp.category} · Used on {stamp.usage_count ?? 0} scripts ·{" "}
                  {restrictionSummary(stamp)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => openEdit(stamp)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={index === 0}
                  onClick={() =>
                    startTransition(async () => {
                      await reorderMarkingStampAction(stamp.id, "up");
                      setStamps((prev) => {
                        const next = [...prev].sort(
                          (a, b) => a.sort_order - b.sort_order,
                        );
                        const i = next.findIndex((s) => s.id === stamp.id);
                        if (i <= 0) return prev;
                        const a = next[i - 1]!;
                        const b = next[i]!;
                        const aOrder = a.sort_order;
                        next[i - 1] = { ...a, sort_order: b.sort_order };
                        next[i] = { ...b, sort_order: aOrder };
                        return next;
                      });
                    })
                  }
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={index === ordered.length - 1}
                  onClick={() =>
                    startTransition(async () => {
                      await reorderMarkingStampAction(stamp.id, "down");
                      setStamps((prev) => {
                        const next = [...prev].sort(
                          (a, b) => a.sort_order - b.sort_order,
                        );
                        const i = next.findIndex((s) => s.id === stamp.id);
                        if (i < 0 || i >= next.length - 1) return prev;
                        const a = next[i]!;
                        const b = next[i + 1]!;
                        const aOrder = a.sort_order;
                        next[i] = { ...a, sort_order: b.sort_order };
                        next[i + 1] = { ...b, sort_order: aOrder };
                        return next;
                      });
                    })
                  }
                >
                  Down
                </Button>
                {status === "Active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setConfirm({
                        kind: "hide",
                        stamp,
                        message:
                          "Hide this stamp from the teacher annotation palette? Existing annotations keep their images.",
                      })
                    }
                  >
                    Hide from palette
                  </Button>
                ) : status === "Hidden" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await restoreMarkingStampToPaletteAction(
                          stamp.id,
                        );
                        if (result.stamp) {
                          setStamps((prev) =>
                            prev.map((s) =>
                              s.id === result.stamp!.id ? result.stamp! : s,
                            ),
                          );
                        }
                      })
                    }
                  >
                    Restore to palette
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await restoreMarkingStampToPaletteAction(
                          stamp.id,
                        );
                        if (result.stamp) {
                          setStamps((prev) =>
                            prev.map((s) =>
                              s.id === result.stamp!.id ? result.stamp! : s,
                            ),
                          );
                        }
                      })
                    }
                  >
                    Restore
                  </Button>
                )}
                {status !== "Archived" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setConfirm({
                        kind: "archive",
                        stamp,
                        message:
                          "Archive this stamp? It will stay available for historical scripts and can be restored later.",
                      })
                    }
                  >
                    Archive
                  </Button>
                ) : null}
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-haspopup="menu"
                    aria-expanded={menuOpenId === stamp.id}
                    onClick={() =>
                      setMenuOpenId((id) => (id === stamp.id ? null : stamp.id))
                    }
                  >
                    More
                  </Button>
                  {menuOpenId === stamp.id ? (
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          setMenuOpenId(null);
                          setConfirm({
                            kind: "delete",
                            stamp,
                            message:
                              "Permanently delete this stamp? This is only allowed when no annotations or assignment selections reference it.",
                          });
                        }}
                      >
                        Delete permanently
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {edit ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stamp-edit-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="stamp-edit-title" className="text-lg font-semibold text-slate-900">
              Edit stamp
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Replacing the image creates a new asset version. Existing annotations keep the previous image.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">Name</span>
                <Input
                  value={edit.name}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">Accessible label</span>
                <Input
                  value={edit.accessible_label}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? { ...prev, accessible_label: e.target.value }
                        : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Category</span>
                <Input
                  value={edit.category}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev ? { ...prev, category: e.target.value } : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Display order</span>
                <Input
                  type="number"
                  value={edit.sort_order}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? { ...prev, sort_order: Number(e.target.value) || 0 }
                        : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Default width</span>
                <Input
                  type="number"
                  min={16}
                  max={512}
                  value={edit.default_width_px}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            default_width_px: Number(e.target.value) || 64,
                          }
                        : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Default height</span>
                <Input
                  type="number"
                  min={16}
                  max={512}
                  value={edit.default_height_px}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            default_height_px: Number(e.target.value) || 64,
                          }
                        : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">Subject restriction</span>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  value={edit.subject_restriction}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? { ...prev, subject_restriction: e.target.value }
                        : prev,
                    )
                  }
                >
                  <option value="">All subjects</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.is_palette_visible && !edit.archived}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            is_palette_visible: e.target.checked,
                            archived: e.target.checked ? false : prev.archived,
                          }
                        : prev,
                    )
                  }
                />
                Visible in palette
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.is_active && !edit.archived}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            is_active: e.target.checked,
                            archived: e.target.checked ? false : prev.archived,
                          }
                        : prev,
                    )
                  }
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={edit.archived}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            archived: e.target.checked,
                            is_active: e.target.checked ? false : prev.is_active,
                            is_palette_visible: e.target.checked
                              ? false
                              : prev.is_palette_visible,
                          }
                        : prev,
                    )
                  }
                />
                Archived
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">
                  Replacement image (optional)
                </span>
                <Input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) {
                      setEdit((prev) =>
                        prev
                          ? { ...prev, file: null, previewUrl: null }
                          : prev,
                      );
                      return;
                    }
                    if (!["image/png", "image/svg+xml", "image/webp"].includes(file.type)) {
                      setEdit((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: "error",
                              error: "Stamp must be PNG, SVG or WebP",
                            }
                          : prev,
                      );
                      return;
                    }
                    if (file.size > 2 * 1024 * 1024) {
                      setEdit((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: "error",
                              error: "Stamp file must be 2MB or smaller",
                            }
                          : prev,
                      );
                      return;
                    }
                    const url = URL.createObjectURL(file);
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            file,
                            previewUrl: url,
                            status: "idle",
                            error: null,
                          }
                        : prev,
                    );
                  }}
                />
              </label>
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-50">
                  {edit.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={edit.previewUrl}
                      alt="Preview"
                      className="max-h-14 max-w-14 object-contain"
                    />
                  ) : (
                    <StampImage
                      storagePath={edit.stamp.storage_path}
                      alt={edit.accessible_label}
                      className="max-h-14 max-w-14 object-contain"
                    />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Preview of the image teachers will place for new annotations.
                </p>
              </div>
            </div>
            {edit.error ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {edit.error}
              </p>
            ) : null}
            {edit.status === "saved" ? (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Saved
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEdit(null)}
                disabled={edit.status === "saving"}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void saveEdit()}
                disabled={edit.status === "saving"}
              >
                {edit.status === "saving" ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stamp-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="stamp-confirm-title" className="text-lg font-semibold text-slate-900">
              {confirm.kind === "hide" || confirm.kind === "delete-blocked"
                ? "Hide from palette"
                : confirm.kind === "archive"
                  ? "Archive stamp"
                  : "Delete permanently"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{confirm.message}</p>
            {confirm.error ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {confirm.error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={confirm.busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={confirm.busy}
                onClick={runConfirm}
              >
                {confirm.busy
                  ? "Working…"
                  : confirm.kind === "hide" || confirm.kind === "delete-blocked"
                    ? "Hide from palette"
                    : confirm.kind === "archive"
                      ? "Archive"
                      : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
