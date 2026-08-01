/**
 * Local-first versioned autosave helpers.
 * Prevents stale server responses from overwriting newer local edits.
 */

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveControllerOptions<T> {
  /** Debounce delay in ms after typing stops (800–1500 recommended). */
  delayMs?: number;
  /** Persist the latest local snapshot. Must not remount the UI. */
  save: (value: T, version: number) => Promise<{ ok: boolean; error?: string }>;
  /** Optional: merge server IDs into local state without replacing content. */
  applyServerPatch?: (local: T, version: number) => T | void;
}

export interface AutosaveController<T> {
  status: AutosaveStatus;
  version: number;
  lastSavedAt: Date | null;
  lastError: string | null;
  /** Call whenever local state changes. Schedules a debounced save. */
  markDirty: (value: T) => void;
  /** Flush immediately (manual Save). */
  flush: () => Promise<boolean>;
  /** Cancel pending debounce (does not abort in-flight). */
  cancelPending: () => void;
  /** Dispose timers. */
  dispose: () => void;
  /** Whether navigation should warn. */
  hasUnsavedChanges: () => boolean;
  getStatus: () => AutosaveStatus;
  getLastSavedAt: () => Date | null;
}

/**
 * Pure decision: should a completed save apply its result to UI state?
 * Only when no newer local version exists.
 */
export function shouldApplySaveResult(
  completedVersion: number,
  currentVersion: number,
): boolean {
  return completedVersion === currentVersion;
}

/**
 * Pure decision: should an in-flight older save be ignored when a newer one started?
 */
export function isStaleSave(
  completedVersion: number,
  latestStartedVersion: number,
): boolean {
  return completedVersion < latestStartedVersion;
}

export function createAutosaveController<T>(
  options: AutosaveControllerOptions<T>,
): AutosaveController<T> {
  const delayMs = options.delayMs ?? 1200;
  let status: AutosaveStatus = "idle";
  let version = 0;
  let latestValue: T | undefined;
  let lastSavedAt: Date | null = null;
  let lastError: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlightVersion: number | null = null;
  let latestStartedVersion = 0;
  let disposed = false;

  async function runSave(triggerVersion: number): Promise<boolean> {
    if (disposed || latestValue === undefined) return false;
    if (inFlightVersion != null) {
      // Wait for in-flight to finish; a follow-up will be scheduled if still dirty
      return false;
    }

    const snapshot = latestValue;
    const saveVersion = triggerVersion;
    inFlightVersion = saveVersion;
    latestStartedVersion = Math.max(latestStartedVersion, saveVersion);
    status = "saving";

    try {
      const result = await options.save(snapshot, saveVersion);
      if (disposed) return false;

      if (isStaleSave(saveVersion, latestStartedVersion)) {
        // A newer save was started; ignore this completion for status
        return false;
      }

      if (!result.ok) {
        status = "error";
        lastError = result.error ?? "Save failed";
        return false;
      }

      lastSavedAt = new Date();
      lastError = null;

      if (shouldApplySaveResult(saveVersion, version)) {
        if (options.applyServerPatch) {
          const patched = options.applyServerPatch(snapshot, saveVersion);
          if (patched !== undefined) latestValue = patched;
        }
        status = "saved";
      } else {
        // Newer local edits exist — keep dirty and schedule another save
        status = "dirty";
        schedule();
      }
      return result.ok;
    } catch (e) {
      if (!disposed) {
        status = "error";
        lastError = e instanceof Error ? e.message : "Save failed";
      }
      return false;
    } finally {
      if (inFlightVersion === saveVersion) inFlightVersion = null;
      // If edits arrived during the save, ensure we persist them
      if (!disposed && version > saveVersion && status !== "error") {
        status = "dirty";
        schedule();
      }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runSave(version);
    }, delayMs);
  }

  return {
    get status() {
      return status;
    },
    get version() {
      return version;
    },
    get lastSavedAt() {
      return lastSavedAt;
    },
    get lastError() {
      return lastError;
    },
    markDirty(value: T) {
      latestValue = value;
      version += 1;
      status = "dirty";
      schedule();
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (latestValue === undefined) return true;
      // If already saving this exact version, wait by re-running after
      if (inFlightVersion != null) {
        // Bump so we save current snapshot after in-flight completes
        version += 1;
        status = "dirty";
      }
      return runSave(version);
    },
    cancelPending() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    dispose() {
      // Flush any debounced work before teardown so client navigations do not
      // silently drop the latest answers. Fire-and-forget; callers that need
      // confirmed persistence should await flush() before navigating.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (
        latestValue !== undefined &&
        (status === "dirty" || status === "error")
      ) {
        void runSave(version).finally(() => {
          disposed = true;
        });
        return;
      }
      disposed = true;
    },
    hasUnsavedChanges() {
      return status === "dirty" || status === "saving" || status === "error";
    },
    getStatus() {
      return status;
    },
    getLastSavedAt() {
      return lastSavedAt;
    },
  };
}

export function formatAutosaveLabel(
  status: AutosaveStatus,
  lastSavedAt: Date | null,
): string {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return lastSavedAt
        ? `Saved ${lastSavedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : "Saved";
    case "error":
      return "Save failed";
    default:
      return "All changes saved";
  }
}
