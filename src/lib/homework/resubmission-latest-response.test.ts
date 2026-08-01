import { describe, expect, it } from "vitest";
import {
  createAutosaveController,
  isStaleSave,
  shouldApplySaveResult,
} from "./autosave";
import { buildMcqAnswerJson } from "./mcq-answers";
import {
  collectResponses,
  valuesToCompletionSnapshots,
} from "./response-collect";
import {
  maxClientVersionFromRows,
  pickAuthoritativeResponsesByQuestion,
  shouldSkipStructuredUpsert,
  structuredResponseFingerprint,
  structuredUpsertSkipReason,
} from "./response-protect";
import { applyMcqOptions, createBlock, emptySection } from "./structure";
import { buildValuesFromResponses } from "@/components/shared/structured-worksheet-renderer";

/**
 * Simulates the authoritative in-memory DB row used by student/teacher renderers.
 */
function applyUpsert(
  store: Map<
    string,
    {
      id: string;
      submission_id: string;
      question_id: string;
      text_value: string | null;
      numeric_value: number | null;
      boolean_value: boolean | null;
      json_value: unknown;
      client_version: number;
      updated_at: string;
      created_at: string;
    }
  >,
  submissionId: string,
  incoming: {
    question_id: string;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
    json_value?: unknown;
    client_version?: number;
  },
): { ok: boolean; error?: string; skipped?: string } {
  const existing = store.get(incoming.question_id);
  const incomingEmpty = !String(incoming.text_value ?? "").trim() &&
    incoming.numeric_value == null &&
    incoming.boolean_value == null &&
    incoming.json_value == null;
  const existingPopulated = Boolean(
    existing &&
      (String(existing.text_value ?? "").trim() ||
        existing.numeric_value != null ||
        existing.boolean_value != null ||
        existing.json_value != null),
  );
  const existingVersion = existing?.client_version ?? 0;
  const incomingVersion =
    typeof incoming.client_version === "number" ? incoming.client_version : null;

  const reason = structuredUpsertSkipReason({
    incomingEmpty,
    existingPopulated,
    incomingVersion,
    existingVersion,
  });

  if (reason === "stale_version") {
    const existingFp = structuredResponseFingerprint(existing ?? {});
    const incomingFp = structuredResponseFingerprint(incoming);
    if (existingFp !== incomingFp) {
      return {
        ok: false,
        error: "stale_version_rejected",
        skipped: reason,
      };
    }
    return { ok: true, skipped: reason };
  }
  if (reason === "empty_overwrite") {
    return { ok: true, skipped: reason };
  }

  const now = new Date().toISOString();
  const row = {
    id: existing?.id ?? `resp-${incoming.question_id}`,
    submission_id: submissionId,
    question_id: incoming.question_id,
    text_value: incoming.text_value ?? null,
    numeric_value: incoming.numeric_value ?? null,
    boolean_value: incoming.boolean_value ?? null,
    json_value: incoming.json_value ?? null,
    client_version: incomingVersion ?? existingVersion,
    updated_at: now,
    created_at: existing?.created_at ?? now,
  };
  store.set(incoming.question_id, row);
  return { ok: true };
}

describe("phase 6 resubmission keeps latest response", () => {
  it("written: second version survives reload + resubmit on the same submission id", () => {
    const writing = createBlock("extended_writing");
    writing.required = true;
    writing.content = "Explain";
    const section = emptySection();
    section.blocks = [writing];
    const qid = writing.question_id!;

    // One authoritative submission throughout.
    const submission = {
      id: "sub-1",
      status: "in_progress" as string,
    };
    const store = new Map<
      string,
      {
        id: string;
        submission_id: string;
        question_id: string;
        text_value: string | null;
        numeric_value: number | null;
        boolean_value: boolean | null;
        json_value: unknown;
        client_version: number;
        updated_at: string;
        created_at: string;
      }
    >();

    // 1) First draft save (session may have autosaved many times → high version)
    let save = applyUpsert(store, submission.id, {
      question_id: qid,
      text_value: "First version",
      client_version: 5,
    });
    expect(save.ok).toBe(true);
    expect(store.get(qid)?.text_value).toBe("First version");

    // 2) First submission (status only)
    submission.status = "submitted";
    const submissionIdAfterFirstSubmit = submission.id;

    // 3) Unsubmit (same id)
    submission.status = "in_progress";
    expect(submission.id).toBe(submissionIdAfterFirstSubmit);

    // 4) Reload remount — BUG was initialVersion=0; FIX seeds from DB.
    const seededVersion = maxClientVersionFromRows([...store.values()]);
    expect(seededVersion).toBe(5);

    const afterReloadValues = buildValuesFromResponses([section], {
      [qid]: {
        id: store.get(qid)!.id,
        submission_id: submission.id,
        question_id: qid,
        text_value: store.get(qid)!.text_value,
        numeric_value: null,
        boolean_value: null,
        json_value: null,
        file_name: null,
        storage_path: null,
        client_version: store.get(qid)!.client_version,
        created_at: store.get(qid)!.created_at,
        updated_at: store.get(qid)!.updated_at,
      },
    });
    expect(afterReloadValues[qid]?.type).toBe("text");
    if (afterReloadValues[qid]?.type === "text") {
      expect(afterReloadValues[qid].text).toBe("First version");
    }

    // Without seed, post-reload version restarts at 1 and is rejected as stale.
    const buggy = applyUpsert(store, submission.id, {
      question_id: qid,
      text_value: "Second version",
      client_version: 1,
    });
    expect(buggy.ok).toBe(false);
    expect(store.get(qid)?.text_value).toBe("First version");

    // With seed, next edit is version 6 and wins.
    save = applyUpsert(store, submission.id, {
      question_id: qid,
      text_value: "Second version",
      client_version: seededVersion + 1,
    });
    expect(save.ok).toBe(true);
    expect(store.get(qid)?.text_value).toBe("Second version");
    expect(store.get(qid)?.client_version).toBe(6);

    // 5) Confirm DB active response before resubmit
    expect(store.get(qid)?.text_value).toBe("Second version");

    // 6) Resubmit status-only — same submission id, no snapshot restore
    submission.status = "submitted";
    expect(submission.id).toBe(submissionIdAfterFirstSubmit);

    // 7/8) Student + teacher renderers read the same authoritative row
    const renderValues = buildValuesFromResponses([section], {
      [qid]: {
        id: store.get(qid)!.id,
        submission_id: submission.id,
        question_id: qid,
        text_value: store.get(qid)!.text_value,
        numeric_value: null,
        boolean_value: null,
        json_value: null,
        file_name: null,
        storage_path: null,
        client_version: store.get(qid)!.client_version,
        created_at: store.get(qid)!.created_at,
        updated_at: store.get(qid)!.updated_at,
      },
    });
    expect(renderValues[qid]?.type).toBe("text");
    if (renderValues[qid]?.type === "text") {
      expect(renderValues[qid].text).toBe("Second version");
      expect(renderValues[qid].text).not.toBe("First version");
    }

    const collected = collectResponses(
      { [qid]: { type: "text", text: "Second version" } },
      [section],
      2,
    );
    expect(collected[0]?.text_value).toBe("Second version");
    expect(structuredResponseFingerprint(store.get(qid)!)).toBe(
      structuredResponseFingerprint(collected[0]!),
    );
  });

  it("MCQ: option C survives reload + resubmit; A is not restored", () => {
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "opt-a", label: "A", correct: true },
      { id: "opt-b", label: "B", correct: false },
      { id: "opt-c", label: "C", correct: false },
    ]);
    mcq.required = true;
    const section = emptySection();
    section.blocks = [mcq];
    const qid = mcq.question_id!;

    const submissionId = "sub-mcq-1";
    const store = new Map<
      string,
      {
        id: string;
        submission_id: string;
        question_id: string;
        text_value: string | null;
        numeric_value: number | null;
        boolean_value: boolean | null;
        json_value: unknown;
        client_version: number;
        updated_at: string;
        created_at: string;
      }
    >();

    // Select A, submit
    expect(
      applyUpsert(store, submissionId, {
        question_id: qid,
        text_value: "A",
        json_value: buildMcqAnswerJson(["opt-a"]),
        client_version: 3,
      }).ok,
    ).toBe(true);

    // Unsubmit + reload seed
    const seeded = maxClientVersionFromRows([...store.values()]);
    expect(seeded).toBe(3);

    // Select C with advanced version
    expect(
      applyUpsert(store, submissionId, {
        question_id: qid,
        text_value: "C",
        json_value: buildMcqAnswerJson(["opt-c"]),
        client_version: seeded + 1,
      }).ok,
    ).toBe(true);

    const active = store.get(qid)!;
    expect(active.json_value).toEqual(buildMcqAnswerJson(["opt-c"]));
    expect(active.text_value).toBe("C");

    const values = buildValuesFromResponses([section], {
      [qid]: {
        id: active.id,
        submission_id: submissionId,
        question_id: qid,
        text_value: active.text_value,
        numeric_value: null,
        boolean_value: null,
        json_value: active.json_value,
        file_name: null,
        storage_path: null,
        client_version: active.client_version,
        created_at: active.created_at,
        updated_at: active.updated_at,
      },
    });
    expect(values[qid]).toEqual({ type: "mcq", optionIds: ["opt-c"] });

    // Stale save of A finishing last must not win
    const stale = applyUpsert(store, submissionId, {
      question_id: qid,
      text_value: "A",
      json_value: buildMcqAnswerJson(["opt-a"]),
      client_version: 3,
    });
    expect(stale.ok).toBe(false);
    expect(store.get(qid)?.json_value).toEqual(buildMcqAnswerJson(["opt-c"]));
  });

  it("race: older in-flight save cannot overwrite a newer authoritative value", async () => {
    const authoritative: { value: string; version: number } = {
      value: "old",
      version: 6,
    };

    // Simulate out-of-order completion: newer write lands first.
    const applyServerWrite = (value: string, version: number) => {
      if (
        shouldSkipStructuredUpsert({
          incomingEmpty: false,
          existingPopulated: authoritative.value.length > 0,
          incomingVersion: version,
          existingVersion: authoritative.version,
        })
      ) {
        const same =
          structuredResponseFingerprint({ text_value: value }) ===
          structuredResponseFingerprint({ text_value: authoritative.value });
        return same
          ? { ok: true as const }
          : { ok: false as const, error: "stale_version_rejected" };
      }
      authoritative.value = value;
      authoritative.version = version;
      return { ok: true as const };
    };

    expect(applyServerWrite("new", 7).ok).toBe(true);
    expect(authoritative).toEqual({ value: "new", version: 7 });

    // Old request finishes last and must be rejected.
    const lateOld = applyServerWrite("old", 6);
    expect(lateOld.ok).toBe(false);
    expect(authoritative.value).toBe("new");
    expect(isStaleSave(6, 7)).toBe(true);
    expect(shouldApplySaveResult(6, 7)).toBe(false);

    // Controller also refuses to treat a stale completion as Saved.
    let resolveOld!: (v: { ok: boolean }) => void;
    const oldPending = new Promise<{ ok: boolean }>((r) => {
      resolveOld = r;
    });
    const controller = createAutosaveController<string>({
      delayMs: 5,
      initialVersion: 5,
      save: async (value) => {
        if (value === "old") return oldPending;
        return { ok: true };
      },
    });
    controller.markDirty("old");
    await new Promise((r) => setTimeout(r, 15));
    controller.markDirty("new");
    const flushPromise = controller.flush();
    resolveOld({ ok: true });
    await flushPromise;
    expect(controller.version).toBeGreaterThanOrEqual(7);
    controller.dispose();
  });

  it("picks the latest duplicate response row for renderers", () => {
    const map = pickAuthoritativeResponsesByQuestion([
      {
        id: "old",
        question_id: "q1",
        client_version: 2,
        updated_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        text_value: "Original answer",
      },
      {
        id: "new",
        question_id: "q1",
        client_version: 6,
        updated_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        text_value: "Updated answer",
      },
    ]);
    expect(map.get("q1")?.id).toBe("new");
    expect(map.get("q1")?.text_value).toBe("Updated answer");
  });

  it("seeds autosave so the first post-reload edit advances past DB version", async () => {
    const saved: Array<{ value: string; version: number }> = [];
    const controller = createAutosaveController<string>({
      delayMs: 5,
      initialVersion: 9,
      save: async (value, version) => {
        saved.push({ value, version });
        return { ok: true };
      },
    });
    expect(controller.version).toBe(9);
    controller.markDirty("Updated answer");
    const ok = await controller.flush();
    expect(ok).toBe(true);
    expect(saved.at(-1)).toEqual({ value: "Updated answer", version: 10 });
    controller.dispose();
  });

  it("completion snapshots for resubmit validation use DB-backed values", () => {
    const writing = createBlock("extended_writing");
    writing.required = true;
    const section = emptySection();
    section.blocks = [writing];
    const snapshots = valuesToCompletionSnapshots(
      {
        [writing.question_id!]: {
          type: "text",
          text: "Second version",
        },
      },
      [section],
    );
    expect(snapshots[0]?.text_value).toBe("Second version");
  });
});
