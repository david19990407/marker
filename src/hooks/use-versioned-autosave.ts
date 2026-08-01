"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAutosaveController,
  formatAutosaveLabel,
  type AutosaveStatus,
} from "@/lib/homework/autosave";

export function useVersionedAutosave<T>(options: {
  delayMs?: number;
  save: (value: T, version: number) => Promise<{ ok: boolean; error?: string }>;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const saveRef = useRef(options.save);
  saveRef.current = options.save;

  const controllerRef = useRef(
    createAutosaveController<T>({
      delayMs: options.delayMs ?? 1200,
      save: (value, version) => saveRef.current(value, version),
    }),
  );

  const sync = useCallback(() => {
    const c = controllerRef.current;
    setStatus(c.getStatus());
    setLastSavedAt(c.getLastSavedAt());
    setLastError(c.lastError);
  }, []);

  const markDirty = useCallback(
    (value: T) => {
      if (options.enabled === false) return;
      controllerRef.current.markDirty(value);
      sync();
      // Poll briefly while saving for status transitions from async work
      window.setTimeout(sync, options.delayMs ?? 1200);
      window.setTimeout(sync, (options.delayMs ?? 1200) + 50);
    },
    [options.delayMs, options.enabled, sync],
  );

  const flush = useCallback(async () => {
    const ok = await controllerRef.current.flush();
    sync();
    return ok;
  }, [sync]);

  useEffect(() => {
    const id = window.setInterval(sync, 400);
    return () => {
      window.clearInterval(id);
      controllerRef.current.dispose();
    };
  }, [sync]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (controllerRef.current.hasUnsavedChanges()) {
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
    label: formatAutosaveLabel(status, lastSavedAt),
    markDirty,
    flush,
    hasUnsavedChanges: () => controllerRef.current.hasUnsavedChanges(),
  };
}
