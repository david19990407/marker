import { describe, expect, it } from "vitest";
import { createUndoStack } from "./undo-stack";

describe("annotation undo stack", () => {
  it("supports add, undo and redo", () => {
    const stack = createUndoStack<number[]>();
    let state = [1];
    stack.push({
      label: "add",
      undo: () => [1],
      redo: () => [1, 2],
    });
    state = [1, 2];
    expect(stack.canUndo()).toBe(true);
    state = stack.undo()!;
    expect(state).toEqual([1]);
    expect(stack.canRedo()).toBe(true);
    state = stack.redo()!;
    expect(state).toEqual([1, 2]);
  });

  it("clears redo after a new command", () => {
    const stack = createUndoStack<string>();
    stack.push({ label: "a", undo: () => "0", redo: () => "a" });
    stack.undo();
    stack.push({ label: "b", undo: () => "0", redo: () => "b" });
    expect(stack.canRedo()).toBe(false);
  });
});
