"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAutosaveController,
  formatAutosaveLabel,
  type AutosaveStatus,
} from "@/lib/homework/autosave";

type SaveFn<T> = (
  value: T,
  version: number,
) => Promise<{ ok: boolean; error?: string }>;

export function useVersionedAutosave<T>(options: {
  delayMs?: number;
  /**
   * Seed from max persisted client_version so post-reload edits are not
   * rejected as stale against the first-session versions.
   */
  initialVersion?: number;
  save: SaveFn<T>;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const delayMs = options.delayMs ?? 1200;
  const enabled = options.enabled !== false;
  const initialVersion = Math.max(0, Math.floor(options.initialVersion ?? 0));

  const saveBox = useRef<{ save: SaveFn<T> }>({ save: options.save });
  const controllerHolder = useRef<ReturnType<
    typeof createAutosaveController<T>
  > | null>(null);
  const initialVersionRef = useRef(initialVersion);

  // Keep latest save function without mutating React state.
  useEffect(() => {
    saveBox.current.save = options.save;
  }, [options.save]);

  useEffect(() => {
    initialVersionRef.current = initialVersion;
  }, [initialVersion]);

  const getController = useCallback(() => {
    if (!controllerHolder.current) {
      controllerHolder.current = createAutosaveController<T>({
        delayMs,
        initialVersion: initialVersionRef.current,
        save: (value, version) => saveBox.current.save(value, version),
      });
    }
    return controllerHolder.current;
  }, [delayMs]);

  const sync = useCallback(() => {
    const c = controllerHolder.current;
    if (!c) return;
    setStatus(c.getStatus());
    setLastSavedAt(c.getLastSavedAt());
    setLastError(c.lastError);
  }, []);

  const markDirty = useCallback(
    (value: T) => {
      if (!enabled) return;
      getController().markDirty(value);
      sync();
      window.setTimeout(sync, delayMs);
      window.setTimeout(sync, delayMs + 80);
    },
    [delayMs, enabled, getController, sync],
  );

  const flush = useCallback(async () => {
    const controller = getController();
    const ok = await controller.flush();
    sync();
    return {
      ok,
      error: controller.lastError,
    };
  }, [getController, sync]);

  useEffect(() => {
    const id = window.setInterval(sync, 400);
    return () => {
      window.clearInterval(id);
      controllerHolder.current?.dispose();
      controllerHolder.current = null;
    };
  }, [sync]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (controllerHolder.current?.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return {
    status,
    lastSavedAt,
    lastError,
    label: formatAutosaveLabel(status, lastSavedAt, lastError),
    markDirty,
    flush,
    hasUnsavedChanges: () =>
      controllerHolder.current?.hasUnsavedChanges() ?? false,
    getVersion: () => controllerHolder.current?.version ?? 0,
    getLastError: () => controllerHolder.current?.lastError ?? null,
  };
}
