"use client";

import {
  Suspense,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
const initialUpload: UploadState = {};

type TabKey = "active" | "archived";
type PaletteFilter = "all" | "visible" | "hidden";
type PageSize = 25 | 50 | 100;
type SortKey =
  | "sort_order"
  | "name"
  | "category"
  | "usage"
  | "opacity"
  | "updated"
  | "-name"
  | "-category"
  | "-usage"
  | "-opacity"
  | "-updated"
  | "-sort_order";

type ConfirmState =
  | null
  | {
      kind:
        | "hide"
        | "archive"
        | "delete"
        | "delete-blocked"
        | "bulk-hide"
        | "bulk-restore-palette"
        | "bulk-archive"
        | "bulk-restore-archive";
      stamp?: MarkingStamp;
      stampIds?: string[];
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
  default_opacity: number;
  sort_order: number;
  subject_restriction: string;
  is_active: boolean;
  is_palette_visible: boolean;
  archived: boolean;
  lockAspect: boolean;
  aspectRatio: number;
  recommendedWidth: number;
  recommendedHeight: number;
  previewUrl: string | null;
  file: File | null;
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
};

const PAGE_SIZES: PageSize[] = [25, 50, 100];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "sort_order", label: "Display order" },
  { value: "-sort_order", label: "Display order (desc)" },
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "category", label: "Category A–Z" },
  { value: "-category", label: "Category Z–A" },
  { value: "-usage", label: "Usage (high–low)" },
  { value: "usage", label: "Usage (low–high)" },
  { value: "-opacity", label: "Opacity (high–low)" },
  { value: "opacity", label: "Opacity (low–high)" },
  { value: "-updated", label: "Recently updated" },
  { value: "updated", label: "Least recently updated" },
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function stampStatus(stamp: MarkingStamp): "Active" | "Hidden" | "Archived" {
  if (stamp.archived_at) return "Archived";
  if (!stamp.is_palette_visible || !stamp.is_active) return "Hidden";
  return "Active";
}

function opacityPct(opacity: number | null | undefined): number {
  const value =
    typeof opacity === "number" && Number.isFinite(opacity) ? opacity : 1;
  return Math.round(clamp(value, 0.1, 1) * 100);
}

function parseTab(value: string | null): TabKey {
  return value === "archived" ? "archived" : "active";
}

function parsePalette(value: string | null): PaletteFilter {
  if (value === "visible" || value === "hidden") return value;
  return "all";
}

function parsePageSize(value: string | null): PageSize {
  const n = Number(value);
  if (n === 50 || n === 100) return n;
  return 25;
}

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function parseSort(value: string | null): SortKey {
  const allowed = new Set(SORT_OPTIONS.map((o) => o.value));
  if (value && allowed.has(value as SortKey)) return value as SortKey;
  return "sort_order";
}

function matchesSearch(stamp: MarkingStamp, q: string): boolean {
  if (!q) return true;
  const hay = [
    stamp.name,
    stamp.accessible_label,
    stamp.category,
    stamp.subject_restriction ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function compareStamps(a: MarkingStamp, b: MarkingStamp, sort: SortKey): number {
  const desc = sort.startsWith("-");
  const key = (desc ? sort.slice(1) : sort) as
    | "sort_order"
    | "name"
    | "category"
    | "usage"
    | "opacity"
    | "updated";
  let cmp = 0;
  switch (key) {
    case "name":
      cmp = a.name.localeCompare(b.name);
      break;
    case "category":
      cmp = a.category.localeCompare(b.category);
      break;
    case "usage":
      cmp = (a.usage_count ?? 0) - (b.usage_count ?? 0);
      break;
    case "opacity":
      cmp = (a.default_opacity ?? 1) - (b.default_opacity ?? 1);
      break;
    case "updated":
      cmp = String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? ""));
      break;
    default:
      cmp = a.sort_order - b.sort_order;
  }
  if (cmp === 0) cmp = a.name.localeCompare(b.name);
  return desc ? -cmp : cmp;
}

function statusBadgeClass(status: "Active" | "Hidden" | "Archived"): string {
  if (status === "Active") return "bg-emerald-50 text-emerald-800";
  if (status === "Hidden") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function saveStatusLabel(status: EditState["status"]): string | null {
  if (status === "saving") return "Saving";
  if (status === "saved") return "Saved";
  if (status === "error") return "Save failed";
  return null;
}

export function MarkingStampsManager(props: {
  stamps: MarkingStamp[];
  subjects: string[];
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-slate-500">Loading stamp library…</p>
      }
    >
      <MarkingStampsManagerInner {...props} />
    </Suspense>
  );
}

function MarkingStampsManagerInner({
  stamps: initialStamps,
  subjects,
}: {
  stamps: MarkingStamp[];
  subjects: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localStamps, setLocalStamps] = useState<MarkingStamp[] | null>(null);
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadMarkingStampAction,
    initialUpload,
  );
  const [, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const tab = parseTab(searchParams.get("tab"));
  const q = searchParams.get("q") ?? "";
  const palette = parsePalette(searchParams.get("palette"));
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const sort = parseSort(searchParams.get("sort"));

  const stamps = useMemo(() => {
    const base = localStamps ?? initialStamps;
    if (!state.stamp) return base;
    if (base.some((s) => s.id === state.stamp!.id)) {
      return base.map((s) => (s.id === state.stamp!.id ? state.stamp! : s));
    }
    return [...base, state.stamp];
  }, [initialStamps, localStamps, state.stamp]);

  const setStamps = (
    updater: MarkingStamp[] | ((prev: MarkingStamp[]) => MarkingStamp[]),
  ) => {
    setLocalStamps((prev) => {
      const current = prev ?? initialStamps;
      return typeof updater === "function" ? updater(current) : updater;
    });
  };

  function updateParams(
    updates: Record<string, string | null | undefined>,
    options?: { resetPage?: boolean },
  ) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    if (options?.resetPage) params.set("page", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const allStamps = useMemo(() => {
    return [...stamps].sort((a, b) => a.sort_order - b.sort_order);
  }, [stamps]);

  const activeStamps = useMemo(
    () => allStamps.filter((s) => !s.archived_at),
    [allStamps],
  );
  const archivedStamps = useMemo(
    () => allStamps.filter((s) => Boolean(s.archived_at)),
    [allStamps],
  );

  const filtered = useMemo(() => {
    const base = tab === "archived" ? archivedStamps : activeStamps;
    let list = base.filter((s) => matchesSearch(s, q.trim()));
    if (tab === "active" && palette === "visible") {
      list = list.filter((s) => s.is_palette_visible && s.is_active);
    } else if (tab === "active" && palette === "hidden") {
      list = list.filter((s) => !s.is_palette_visible || !s.is_active);
    }
    return [...list].sort((a, b) => compareStamps(a, b, sort));
  }, [tab, archivedStamps, activeStamps, q, palette, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  useEffect(() => {
    if (page !== safePage) {
      updateParams({ page: String(safePage) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when page is out of range
  }, [page, safePage]);

  const activeOrderedIds = useMemo(
    () => activeStamps.map((s) => s.id),
    [activeStamps],
  );

  const pageSelectedCount = pageItems.filter((s) =>
    selectedIds.has(s.id),
  ).length;
  const allPageSelected =
    pageItems.length > 0 && pageSelectedCount === pageItems.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const s of pageItems) next.delete(s.id);
      } else {
        for (const s of pageItems) next.add(s.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function applyStampUpdate(stamp: MarkingStamp) {
    setStamps((prev) =>
      prev.map((s) => (s.id === stamp.id ? stamp : s)),
    );
  }

  function openEdit(stamp: MarkingStamp) {
    setMenuOpenId(null);
    const width = clamp(stamp.default_width_px || 64, 16, 300);
    const height = clamp(stamp.default_height_px || 64, 16, 300);
    const aspect = width / Math.max(1, height);
    setEdit({
      stamp,
      name: stamp.name,
      accessible_label: stamp.accessible_label,
      category: stamp.category,
      default_width_px: width,
      default_height_px: height,
      default_size_pct: stamp.default_size_pct || 8,
      default_opacity: clamp(stamp.default_opacity ?? 1, 0.1, 1),
      sort_order: stamp.sort_order,
      subject_restriction: stamp.subject_restriction ?? "",
      is_active: stamp.is_active,
      is_palette_visible: stamp.is_palette_visible,
      archived: Boolean(stamp.archived_at),
      lockAspect: true,
      aspectRatio: aspect,
      recommendedWidth: 64,
      recommendedHeight: clamp(Math.round(64 / aspect), 16, 300),
      previewUrl: null,
      file: null,
      status: "idle",
      error: null,
    });
  }

  function setEditWidth(nextWidth: number) {
    setEdit((prev) => {
      if (!prev) return prev;
      const width = clamp(Math.round(nextWidth), 16, 300);
      if (!prev.lockAspect) {
        return { ...prev, default_width_px: width, status: "idle", error: null };
      }
      const height = clamp(
        Math.round(width / Math.max(0.01, prev.aspectRatio)),
        16,
        300,
      );
      return {
        ...prev,
        default_width_px: width,
        default_height_px: height,
        status: "idle",
        error: null,
      };
    });
  }

  function setEditHeight(nextHeight: number) {
    setEdit((prev) => {
      if (!prev) return prev;
      const height = clamp(Math.round(nextHeight), 16, 300);
      if (!prev.lockAspect) {
        return {
          ...prev,
          default_height_px: height,
          status: "idle",
          error: null,
        };
      }
      const width = clamp(
        Math.round(height * Math.max(0.01, prev.aspectRatio)),
        16,
        300,
      );
      return {
        ...prev,
        default_width_px: width,
        default_height_px: height,
        status: "idle",
        error: null,
      };
    });
  }

  function resetRecommendedSize() {
    setEdit((prev) =>
      prev
        ? {
            ...prev,
            default_width_px: prev.recommendedWidth,
            default_height_px: prev.recommendedHeight,
            status: "idle",
            error: null,
          }
        : prev,
    );
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
      default_opacity: clamp(edit.default_opacity, 0.1, 1),
      sort_order: edit.sort_order,
      subject_restriction: edit.subject_restriction.trim() || null,
      is_active: edit.archived ? false : edit.is_active,
      is_palette_visible: edit.archived ? false : edit.is_palette_visible,
      archived_at: edit.archived
        ? (edit.stamp.archived_at ?? new Date().toISOString())
        : null,
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
        if (result.stamp) applyStampUpdate(result.stamp);
        return;
      }
      if (imageResult.stamp) {
        applyStampUpdate({
          ...imageResult.stamp,
          default_opacity: patch.default_opacity,
        });
      }
    } else if (result.stamp) {
      applyStampUpdate(result.stamp);
    }

    setEdit((prev) =>
      prev ? { ...prev, status: "saved", error: null, file: null } : prev,
    );
    window.setTimeout(() => setEdit(null), 450);
  }

  function runConfirm() {
    if (!confirm) return;
    const current = confirm;
    setConfirm({ ...current, busy: true, error: undefined });
    startTransition(async () => {
      if (
        current.kind === "bulk-hide" ||
        current.kind === "bulk-restore-palette" ||
        current.kind === "bulk-archive" ||
        current.kind === "bulk-restore-archive"
      ) {
        const ids = current.stampIds ?? [];
        setBulkBusy(true);
        try {
          for (const id of ids) {
            let result: ActionResult & { stamp?: MarkingStamp };
            if (current.kind === "bulk-hide") {
              result = await hideMarkingStampFromPaletteAction(id);
            } else if (
              current.kind === "bulk-restore-palette" ||
              current.kind === "bulk-restore-archive"
            ) {
              result = await restoreMarkingStampToPaletteAction(id);
            } else {
              result = await archiveMarkingStampAction(id);
            }
            if (result.error) {
              setConfirm((prev) =>
                prev
                  ? { ...prev, busy: false, error: result.error }
                  : prev,
              );
              setBulkBusy(false);
              return;
            }
            if (result.stamp) applyStampUpdate(result.stamp);
          }
          clearSelection();
          setConfirm(null);
        } finally {
          setBulkBusy(false);
        }
        return;
      }

      const stamp = current.stamp;
      if (!stamp) {
        setConfirm(null);
        return;
      }

      if (current.kind === "hide" || current.kind === "delete-blocked") {
        const result = await hideMarkingStampFromPaletteAction(stamp.id);
        if (result.error) {
          setConfirm((prev) =>
            prev ? { ...prev, busy: false, error: result.error } : prev,
          );
          return;
        }
        if (result.stamp) applyStampUpdate(result.stamp);
        else {
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

      if (current.kind === "archive") {
        const result = await archiveMarkingStampAction(stamp.id);
        if (result.error) {
          setConfirm((prev) =>
            prev ? { ...prev, busy: false, error: result.error } : prev,
          );
          return;
        }
        if (result.stamp) applyStampUpdate(result.stamp);
        setConfirm(null);
        return;
      }

      if (current.kind === "delete") {
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
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(stamp.id);
          return next;
        });
        setConfirm(null);
      }
    });
  }

  function reorderLocal(stampId: string, direction: "up" | "down") {
    setStamps((prev) => {
      const next = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const active = next.filter((s) => !s.archived_at);
      const i = active.findIndex((s) => s.id === stampId);
      if (i < 0) return prev;
      const swapIndex = direction === "up" ? i - 1 : i + 1;
      if (swapIndex < 0 || swapIndex >= active.length) return prev;
      const a = active[i]!;
      const b = active[swapIndex]!;
      const aOrder = a.sort_order;
      return next.map((s) => {
        if (s.id === a.id) return { ...s, sort_order: b.sort_order };
        if (s.id === b.id) return { ...s, sort_order: aOrder };
        return s;
      });
    });
  }

  function confirmTitle(kind: NonNullable<ConfirmState>["kind"]): string {
    switch (kind) {
      case "hide":
      case "delete-blocked":
      case "bulk-hide":
        return "Hide from palette";
      case "archive":
      case "bulk-archive":
        return "Archive stamp";
      case "bulk-restore-palette":
        return "Restore to palette";
      case "bulk-restore-archive":
        return "Restore from archive";
      default:
        return "Delete permanently";
    }
  }

  function confirmActionLabel(kind: NonNullable<ConfirmState>["kind"]): string {
    switch (kind) {
      case "hide":
      case "delete-blocked":
      case "bulk-hide":
        return "Hide from palette";
      case "archive":
      case "bulk-archive":
        return "Archive";
      case "bulk-restore-palette":
        return "Restore to palette";
      case "bulk-restore-archive":
        return "Restore from archive";
      default:
        return "Delete permanently";
    }
  }

  const selectedList = [...selectedIds];

  return (
    <div className="space-y-8">
      <form
        action={action}
        className="space-y-4 rounded-2xl border border-slate-100 p-4"
      >
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
            <Input
              name="default_width_px"
              type="number"
              min={16}
              max={300}
              defaultValue={64}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Default height (px)</span>
            <Input
              name="default_height_px"
              type="number"
              min={16}
              max={300}
              defaultValue={64}
            />
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

      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Annotation library tabs"
          className="flex flex-wrap gap-2 border-b border-slate-100 pb-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              tab === "active"
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => {
              clearSelection();
              updateParams(
                { tab: "active", palette: palette === "all" ? null : palette },
                { resetPage: true },
              );
            }}
          >
            Active annotations ({activeStamps.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archived"}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              tab === "archived"
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => {
              clearSelection();
              updateParams(
                { tab: "archived", palette: null },
                { resetPage: true },
              );
            }}
          >
            Archived annotations ({archivedStamps.length})
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 text-sm">
            <span className="mb-1 block text-slate-500">Search</span>
            <Input
              value={q}
              placeholder="Name, label, category, subject…"
              onChange={(e) =>
                updateParams({ q: e.target.value || null }, { resetPage: true })
              }
            />
          </label>
          {tab === "active" ? (
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Palette</span>
              <select
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                value={palette}
                onChange={(e) =>
                  updateParams(
                    {
                      palette:
                        e.target.value === "all" ? null : e.target.value,
                    },
                    { resetPage: true },
                  )
                }
              >
                <option value="all">All</option>
                <option value="visible">Visible in palette</option>
                <option value="hidden">Hidden from palette</option>
              </select>
            </label>
          ) : null}
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Sort</span>
            <select
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={sort}
              onChange={(e) =>
                updateParams(
                  {
                    sort:
                      e.target.value === "sort_order" ? null : e.target.value,
                  },
                  { resetPage: true },
                )
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Per page</span>
            <select
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={pageSize}
              onChange={(e) =>
                updateParams(
                  {
                    pageSize:
                      e.target.value === "25" ? null : e.target.value,
                  },
                  { resetPage: true },
                )
              }
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedList.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">
              {selectedList.length} selected
            </span>
            {tab === "active" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() =>
                    setConfirm({
                      kind: "bulk-hide",
                      stampIds: selectedList,
                      message: `Hide ${selectedList.length} stamp(s) from the teacher annotation palette? Existing annotations keep their images.`,
                    })
                  }
                >
                  Hide
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={bulkBusy}
                  onClick={() =>
                    setConfirm({
                      kind: "bulk-restore-palette",
                      stampIds: selectedList,
                      message: `Restore ${selectedList.length} stamp(s) to the teacher annotation palette?`,
                    })
                  }
                >
                  Restore to palette
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() =>
                    setConfirm({
                      kind: "bulk-archive",
                      stampIds: selectedList,
                      message: `Archive ${selectedList.length} stamp(s)? They stay available for historical scripts and can be restored later.`,
                    })
                  }
                >
                  Archive
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={bulkBusy}
                onClick={() =>
                  setConfirm({
                    kind: "bulk-restore-archive",
                    stampIds: selectedList,
                    message: `Restore ${selectedList.length} stamp(s) from archive to the palette?`,
                  })
                }
              >
                Restore from archive
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clearSelection}
            >
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="px-3 py-2">Stamp</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Default size</th>
                <th className="px-3 py-2">Opacity</th>
                <th className="px-3 py-2">Usage</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No stamps match the current filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((stamp) => {
                  const status = stampStatus(stamp);
                  const activeIndex = activeOrderedIds.indexOf(stamp.id);
                  const isArchived = Boolean(stamp.archived_at);
                  return (
                    <tr
                      key={stamp.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="px-3 py-3 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Select ${stamp.name}`}
                          checked={selectedIds.has(stamp.id)}
                          onChange={() => toggleSelect(stamp.id)}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50">
                            <StampImage
                              storagePath={stamp.storage_path}
                              alt={stamp.accessible_label}
                              className="max-h-10 max-w-10 object-contain"
                              opacity={stamp.default_opacity ?? 1}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">
                              {stamp.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {stamp.accessible_label}
                              {stamp.subject_restriction
                                ? ` · ${stamp.subject_restriction}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-700">
                        {stamp.category}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-700">
                        {stamp.default_width_px || 64}×
                        {stamp.default_height_px || 64}px
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-700">
                        {opacityPct(stamp.default_opacity)}%
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-700">
                        {stamp.usage_count ?? 0}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(stamp)}
                          >
                            Edit
                          </Button>
                          {!isArchived ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={activeIndex <= 0}
                                onClick={() =>
                                  startTransition(async () => {
                                    await reorderMarkingStampAction(
                                      stamp.id,
                                      "up",
                                    );
                                    reorderLocal(stamp.id, "up");
                                  })
                                }
                              >
                                Up
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  activeIndex < 0 ||
                                  activeIndex >= activeOrderedIds.length - 1
                                }
                                onClick={() =>
                                  startTransition(async () => {
                                    await reorderMarkingStampAction(
                                      stamp.id,
                                      "down",
                                    );
                                    reorderLocal(stamp.id, "down");
                                  })
                                }
                              >
                                Down
                              </Button>
                            </>
                          ) : null}
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
                              Hide
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                startTransition(async () => {
                                  const result =
                                    await restoreMarkingStampToPaletteAction(
                                      stamp.id,
                                    );
                                  if (result.stamp) {
                                    applyStampUpdate(result.stamp);
                                  }
                                })
                              }
                            >
                              Restore
                            </Button>
                          )}
                          {!isArchived ? (
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
                                setMenuOpenId((id) =>
                                  id === stamp.id ? null : stamp.id,
                                )
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
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing{" "}
            {filtered.length === 0
              ? 0
              : (safePage - 1) * pageSize + 1}
            –
            {Math.min(safePage * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => updateParams({ page: String(safePage - 1) })}
            >
              Previous
            </Button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => updateParams({ page: String(safePage + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {edit ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stamp-edit-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="stamp-edit-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Edit stamp
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Replacing the image creates a new asset version. Existing
                  annotations keep the previous image.
                </p>
              </div>
              {saveStatusLabel(edit.status) ? (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    edit.status === "saving"
                      ? "bg-slate-100 text-slate-700"
                      : edit.status === "saved"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {saveStatusLabel(edit.status)}
                </span>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_40%)] p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Worksheet preview
              </p>
              <div className="relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.35]"
                  style={{
                    backgroundImage:
                      "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: edit.default_width_px,
                    height: edit.default_height_px,
                  }}
                >
                  {edit.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={edit.previewUrl}
                      alt="Preview"
                      className="h-full w-full object-contain"
                      style={{
                        opacity: clamp(edit.default_opacity, 0.1, 1),
                      }}
                    />
                  ) : (
                    <StampImage
                      storagePath={edit.stamp.storage_path}
                      alt={edit.accessible_label}
                      className="h-full w-full object-contain"
                      opacity={edit.default_opacity}
                    />
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Preview at {edit.default_width_px}×{edit.default_height_px}px
                with opacity {opacityPct(edit.default_opacity)}%.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">Name</span>
                <Input
                  value={edit.name}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? { ...prev, name: e.target.value, status: "idle" }
                        : prev,
                    )
                  }
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">
                  Accessible label
                </span>
                <Input
                  value={edit.accessible_label}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            accessible_label: e.target.value,
                            status: "idle",
                          }
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
                      prev
                        ? {
                            ...prev,
                            category: e.target.value,
                            status: "idle",
                          }
                        : prev,
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
                        ? {
                            ...prev,
                            sort_order: Number(e.target.value) || 0,
                            status: "idle",
                          }
                        : prev,
                    )
                  }
                />
              </label>

              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm text-slate-700">
                    Size: {edit.default_width_px}×{edit.default_height_px}px
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={!edit.lockAspect}
                      onChange={(e) =>
                        setEdit((prev) =>
                          prev
                            ? {
                                ...prev,
                                lockAspect: !e.target.checked,
                                aspectRatio:
                                  prev.default_width_px /
                                  Math.max(1, prev.default_height_px),
                              }
                            : prev,
                        )
                      }
                    />
                    Unlock aspect ratio
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-500">
                    Width (16–300px)
                  </span>
                  <input
                    type="range"
                    min={16}
                    max={300}
                    value={edit.default_width_px}
                    className="w-full accent-slate-900"
                    onChange={(e) => setEditWidth(Number(e.target.value))}
                  />
                </label>
                {!edit.lockAspect ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-500">
                      Height (16–300px)
                    </span>
                    <input
                      type="range"
                      min={16}
                      max={300}
                      value={edit.default_height_px}
                      className="w-full accent-slate-900"
                      onChange={(e) => setEditHeight(Number(e.target.value))}
                    />
                  </label>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetRecommendedSize}
                >
                  Reset to recommended size (
                  {edit.recommendedWidth}×{edit.recommendedHeight})
                </Button>
              </div>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">
                  Opacity: {opacityPct(edit.default_opacity)}%
                </span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={opacityPct(edit.default_opacity)}
                  className="w-full accent-slate-900"
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            default_opacity: clamp(
                              Number(e.target.value) / 100,
                              0.1,
                              1,
                            ),
                            status: "idle",
                            error: null,
                          }
                        : prev,
                    )
                  }
                />
              </label>

              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-500">
                  Subject restriction
                </span>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  value={edit.subject_restriction}
                  onChange={(e) =>
                    setEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            subject_restriction: e.target.value,
                            status: "idle",
                          }
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
                            status: "idle",
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
                            status: "idle",
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
                            is_active: e.target.checked
                              ? false
                              : prev.is_active,
                            is_palette_visible: e.target.checked
                              ? false
                              : prev.is_palette_visible,
                            status: "idle",
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
                    if (
                      !["image/png", "image/svg+xml", "image/webp"].includes(
                        file.type,
                      )
                    ) {
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
            </div>

            {edit.error ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {edit.error}
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
            <h3
              id="stamp-confirm-title"
              className="text-lg font-semibold text-slate-900"
            >
              {confirmTitle(confirm.kind)}
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
                {confirm.busy ? "Working…" : confirmActionLabel(confirm.kind)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
