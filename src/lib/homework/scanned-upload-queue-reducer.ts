/**
 * Authoritative scanned-homework upload queue state machine.
 * The worker must never read React state that has not committed yet —
 * always pass File objects through the reducer items themselves.
 */

export type UploadQueueStateName =
  | "queued"
  | "preparing"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled";

export type UploadQueueItem = {
  clientId: string;
  file: File | null;
  name: string;
  size: number;
  mimeType: string;
  blockId: string;
  submissionId: string | null;
  storagePath: string | null;
  progress: number;
  state: UploadQueueStateName;
  error: string | null;
  retryCount: number;
  databaseFileId: string | null;
  order: number;
  previewUrl: string | null;
  queuedAt: number;
};

export type UploadQueueSnapshot = {
  items: UploadQueueItem[];
};

export type UploadQueueAction =
  | { type: "QUEUE_FILES"; items: UploadQueueItem[] }
  | { type: "START_PREPARING"; clientId: string }
  | { type: "START_UPLOAD"; clientId: string; storagePath?: string }
  | { type: "SET_PROGRESS"; clientId: string; progress: number }
  | {
      type: "UPLOAD_COMPLETE";
      clientId: string;
      storagePath: string;
    }
  | {
      type: "METADATA_COMPLETE";
      clientId: string;
      databaseFileId: string;
      remoteName?: string;
      remoteSize?: number;
    }
  | { type: "PROCESSING_PREVIEW"; clientId: string }
  | { type: "READY"; clientId: string }
  | { type: "FAILED"; clientId: string; error: string }
  | { type: "CANCELLED"; clientId: string }
  | { type: "RETRY"; clientId: string }
  | { type: "REPLACE_ALL" }
  | { type: "HYDRATE_REMOTE"; items: UploadQueueItem[] }
  | {
      type: "PATCH_ITEM";
      clientId: string;
      patch: Partial<UploadQueueItem>;
    };

export const UPLOAD_CONCURRENCY = 2;
export const UPLOAD_START_WATCHDOG_MS = 2_000;
export const UPLOAD_START_FAIL_MS = 5_000;

export function createEmptyUploadQueue(): UploadQueueSnapshot {
  return { items: [] };
}

function patchItem(
  state: UploadQueueSnapshot,
  clientId: string,
  patch: Partial<UploadQueueItem>,
): UploadQueueSnapshot {
  return {
    items: state.items.map((item) =>
      item.clientId === clientId ? { ...item, ...patch } : item,
    ),
  };
}

export function uploadQueueReducer(
  state: UploadQueueSnapshot,
  action: UploadQueueAction,
): UploadQueueSnapshot {
  switch (action.type) {
    case "QUEUE_FILES":
      return { items: [...state.items, ...action.items] };
    case "START_PREPARING":
      return patchItem(state, action.clientId, {
        state: "preparing",
        error: null,
        progress: 0,
      });
    case "START_UPLOAD":
      return patchItem(state, action.clientId, {
        state: "uploading",
        error: null,
        storagePath: action.storagePath ?? null,
      });
    case "SET_PROGRESS":
      return patchItem(state, action.clientId, {
        progress: Math.max(0, Math.min(100, action.progress)),
        state: "uploading",
      });
    case "UPLOAD_COMPLETE":
      return patchItem(state, action.clientId, {
        state: "uploaded",
        progress: 100,
        storagePath: action.storagePath,
        error: null,
      });
    case "METADATA_COMPLETE": {
      const patch: Partial<UploadQueueItem> = {
        state: "uploaded",
        progress: 100,
        databaseFileId: action.databaseFileId,
        // File binary is already in Storage; drop the Blob from memory.
        file: null,
      };
      if (action.remoteName) patch.name = action.remoteName;
      if (typeof action.remoteSize === "number") patch.size = action.remoteSize;
      return patchItem(state, action.clientId, patch);
    }
    case "PROCESSING_PREVIEW":
      return patchItem(state, action.clientId, { state: "processing" });
    case "READY":
      return patchItem(state, action.clientId, {
        state: "ready",
        progress: 100,
        error: null,
        file: null,
      });
    case "FAILED":
      return patchItem(state, action.clientId, {
        state: "failed",
        error: action.error,
      });
    case "CANCELLED":
      return {
        items: state.items.filter((i) => i.clientId !== action.clientId),
      };
    case "RETRY": {
      const item = state.items.find((i) => i.clientId === action.clientId);
      if (!item) return state;
      return patchItem(state, action.clientId, {
        state: "queued",
        progress: 0,
        error: null,
        retryCount: item.retryCount + 1,
        queuedAt: Date.now(),
      });
    }
    case "REPLACE_ALL":
      return { items: [] };
    case "HYDRATE_REMOTE": {
      const activeLocal = state.items.filter(
        (i) =>
          i.state === "queued" ||
          i.state === "preparing" ||
          i.state === "uploading" ||
          i.state === "failed",
      );
      return {
        items: [...action.items, ...activeLocal].sort(
          (a, b) => a.order - b.order,
        ),
      };
    }
    case "PATCH_ITEM":
      return patchItem(state, action.clientId, action.patch);
    default:
      return state;
  }
}

/** Items the worker may start next (has a File and is queued). */
export function selectRunnableQueuedItems(
  state: UploadQueueSnapshot,
): UploadQueueItem[] {
  return state.items.filter(
    (item) => item.state === "queued" && item.file instanceof File,
  );
}

/**
 * Pick up to `slots` runnable items that are not already in-flight.
 * Pure — does not mutate. Caller tracks active IDs in a ref.
 */
export function pickNextUploadJobs(
  state: UploadQueueSnapshot,
  activeIds: ReadonlySet<string>,
  slots: number,
): UploadQueueItem[] {
  if (slots <= 0) return [];
  const runnable = selectRunnableQueuedItems(state).filter(
    (item) => !activeIds.has(item.clientId),
  );
  return runnable.slice(0, slots);
}

export function uploadQueuePhaseLabel(
  state: UploadQueueStateName,
  progress: number,
): string {
  switch (state) {
    case "queued":
      return "Queued";
    case "preparing":
      return "Preparing upload";
    case "uploading":
      return `Uploading, ${Math.round(progress)}%`;
    case "uploaded":
      return "Uploaded";
    case "processing":
      return "Preparing preview";
    case "ready":
      return "Ready";
    case "failed":
      return "Upload failed, Retry";
    case "cancelled":
      return "Cancelled";
    default:
      return "";
  }
}

export function isUploadBusyState(state: UploadQueueStateName): boolean {
  return (
    state === "queued" ||
    state === "preparing" ||
    state === "uploading"
  );
}

/** Build queue items from validated File objects (synchronous). */
export function buildUploadQueueItems(input: {
  files: File[];
  blockId: string;
  submissionId: string | null;
  startingOrder: number;
}): UploadQueueItem[] {
  const now = Date.now();
  return input.files.map((file, index) => ({
    clientId: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    blockId: input.blockId,
    submissionId: input.submissionId,
    storagePath: null,
    progress: 0,
    state: "queued" as const,
    error: null,
    retryCount: 0,
    databaseFileId: null,
    order: input.startingOrder + index,
    previewUrl: file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null,
    queuedAt: now,
  }));
}
