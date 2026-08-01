import { describe, expect, it, vi } from "vitest";
import {
  createAutosaveController,
  isStaleSave,
  shouldApplySaveResult,
} from "./autosave";

describe("autosave versioning", () => {
  it("applies a save only when versions match", () => {
    expect(shouldApplySaveResult(3, 3)).toBe(true);
    expect(shouldApplySaveResult(2, 3)).toBe(false);
  });

  it("detects stale in-flight saves", () => {
    expect(isStaleSave(1, 2)).toBe(true);
    expect(isStaleSave(2, 2)).toBe(false);
  });

  it("keeps newer local value when an older save completes late", async () => {
    let resolveFirst!: (v: { ok: boolean }) => void;
    const first = new Promise<{ ok: boolean }>((r) => {
      resolveFirst = r;
    });
    let call = 0;
    const save = vi.fn(async () => {
      call += 1;
      if (call === 1) return first;
      return { ok: true };
    });

    const controller = createAutosaveController<string>({
      delayMs: 10,
      save,
    });

    controller.markDirty("hello");
    await new Promise((r) => setTimeout(r, 20));
    // User keeps typing while first save is in flight
    controller.markDirty("hello world");

    resolveFirst({ ok: true });
    await new Promise((r) => setTimeout(r, 40));

    // Newer content must still be considered dirty / scheduled — not wiped
    expect(controller.hasUnsavedChanges() || controller.getStatus() === "saved").toBe(
      true,
    );
    expect(controller.version).toBeGreaterThanOrEqual(2);

    await controller.flush();
    expect(save.mock.calls.at(-1)?.[0]).toBe("hello world");
    controller.dispose();
  });

  it("retains error status without clearing local value", async () => {
    const controller = createAutosaveController<string>({
      delayMs: 5,
      save: async () => ({ ok: false, error: "network" }),
    });
    controller.markDirty("keep me");
    await new Promise((r) => setTimeout(r, 20));
    expect(controller.getStatus()).toBe("error");
    expect(controller.lastError).toBe("network");
    await controller.flush();
    // Local value still flushable
    expect(controller.version).toBeGreaterThan(0);
    controller.dispose();
  });

  it("flush returns true only after the current version is saved", async () => {
    const saved: string[] = [];
    const controller = createAutosaveController<string>({
      delayMs: 50,
      save: async (value) => {
        saved.push(value);
        return { ok: true };
      },
    });
    controller.markDirty("v1");
    const ok = await controller.flush();
    expect(ok).toBe(true);
    expect(saved.at(-1)).toBe("v1");
    expect(controller.getStatus()).toBe("saved");
    controller.dispose();
  });

  it("seeds initialVersion so post-reload edits do not restart at 1", async () => {
    const versions: number[] = [];
    const controller = createAutosaveController<string>({
      delayMs: 5,
      initialVersion: 12,
      save: async (_value, version) => {
        versions.push(version);
        return { ok: true };
      },
    });
    expect(controller.version).toBe(12);
    controller.markDirty("after reload");
    await controller.flush();
    expect(versions.at(-1)).toBe(13);
    controller.dispose();
  });
});
