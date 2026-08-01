import { describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "./autosave";
import { evaluateStructuredCompletion } from "./completion";
import { buildMcqAnswerJson } from "./mcq-answers";
import {
  collectResponses,
  valuesToCompletionSnapshots,
} from "./response-collect";
import { applyMcqOptions, createBlock, emptySection } from "./structure";

describe("phase 6 submission lifecycle helpers", () => {
  it("counts extended writing + MCQ from local values as 2 of 2 required", () => {
    const writing = createBlock("extended_writing");
    writing.required = true;
    writing.max_marks = 8;
    writing.content = "Essay";
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", label: "Paris", correct: true },
      { id: "b", label: "Lyon", correct: false },
    ]);
    mcq.required = true;
    mcq.max_marks = 1;
    mcq.content = "Capital?";
    const optional = createBlock("short_text");
    optional.required = false;
    optional.max_marks = 1;
    optional.content = "Optional note";

    const section = emptySection();
    section.blocks = [writing, mcq, optional];

    const values = {
      [writing.question_id!]: {
        type: "text" as const,
        text: "A substantial extended writing answer about the topic.",
      },
      [mcq.question_id!]: { type: "mcq" as const, optionIds: ["a"] },
    };

    const snapshots = valuesToCompletionSnapshots(values, [section]);
    const completion = evaluateStructuredCompletion([section], snapshots);

    expect(completion.requiredCount).toBe(2);
    expect(completion.answeredRequiredCount).toBe(2);
    expect(completion.answeredAssessableCount).toBe(2);
    expect(completion.assessableCount).toBe(3);
    expect(completion.answeredMarks).toBe(9);
    expect(completion.totalMarks).toBe(10);
    expect(completion.isComplete).toBe(true);
    expect(
      completion.questions.find((q) => q.questionId === writing.question_id)
        ?.state,
    ).toBe("answered");
  });

  it("collects extended writing into text_value for the correct question id", () => {
    const writing = createBlock("extended_writing");
    writing.required = true;
    const section = emptySection();
    section.blocks = [writing];
    const essay = "Saved extended writing body";
    const responses = collectResponses(
      { [writing.question_id!]: { type: "text", text: essay } },
      [section],
      7,
    );
    expect(responses).toEqual([
      {
        question_id: writing.question_id,
        text_value: essay,
        client_version: 7,
      },
    ]);
  });

  it("does not count headings/passages/review-only toward completion", () => {
    const section = emptySection();
    const writing = createBlock("extended_writing");
    writing.required = true;
    writing.max_marks = 8;
    section.blocks = [
      createBlock("heading"),
      createBlock("passage"),
      createBlock("teacher_review"),
      writing,
    ];
    const completion = evaluateStructuredCompletion([section], [
      {
        question_id: writing.question_id!,
        text_value: "Answered",
      },
    ]);
    expect(completion.assessableCount).toBe(1);
    expect(completion.answeredAssessableCount).toBe(1);
    expect(completion.answeredMarks).toBe(8);
  });

  it("flush waits for in-flight save and only returns true when saved", async () => {
    let resolveSave!: (v: { ok: boolean }) => void;
    const pending = new Promise<{ ok: boolean }>((r) => {
      resolveSave = r;
    });
    const save = vi.fn(async (value: string) => {
      if (value === "first") return pending;
      return { ok: true };
    });
    const controller = createAutosaveController<string>({
      delayMs: 5,
      save,
    });

    controller.markDirty("first");
    await new Promise((r) => setTimeout(r, 15));
    expect(controller.getStatus()).toBe("saving");

    // Flush must wait for the in-flight save rather than returning early ok.
    const flushPromise = controller.flush();
    resolveSave({ ok: true });
    const ok = await flushPromise;
    expect(ok).toBe(true);
    expect(controller.getStatus()).toBe("saved");
    expect(controller.hasUnsavedChanges()).toBe(false);
    controller.dispose();
  });

  it("flush returns false when still dirty after failed save", async () => {
    const controller = createAutosaveController<string>({
      delayMs: 5,
      save: async () => ({ ok: false, error: "network" }),
    });
    controller.markDirty("essay");
    const ok = await controller.flush();
    expect(ok).toBe(false);
    expect(controller.hasUnsavedChanges()).toBe(true);
    controller.dispose();
  });

  it("keeps mcq option ids in json_value for submit/marking parity", () => {
    const mcq = applyMcqOptions(createBlock("multiple_choice"), [
      { id: "a", label: "A", correct: true },
      { id: "b", label: "B", correct: false },
    ]);
    const section = emptySection();
    section.blocks = [mcq];
    const responses = collectResponses(
      { [mcq.question_id!]: { type: "mcq", optionIds: ["b"] } },
      [section],
    );
    expect(responses[0]?.json_value).toEqual(buildMcqAnswerJson(["b"]));
    expect(responses[0]?.text_value).toBe("B");
  });
});
