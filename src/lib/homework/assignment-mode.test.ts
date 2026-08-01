import { describe, expect, it } from "vitest";
import { detectAssignmentMode } from "./assignment-mode";
import { createBlock, emptySection } from "./structure";

describe("assignment mode detection", () => {
  it("treats empty structure as legacy", () => {
    expect(detectAssignmentMode([])).toBe("legacy");
    expect(detectAssignmentMode(null)).toBe("legacy");
  });

  it("detects structured response worksheets", () => {
    const section = emptySection();
    section.blocks = [createBlock("multiple_choice"), createBlock("passage")];
    expect(detectAssignmentMode([section])).toBe("structured");
  });

  it("keeps single instruction templates as legacy", () => {
    const section = emptySection();
    section.blocks = [createBlock("instruction")];
    expect(detectAssignmentMode([section])).toBe("legacy");
  });
});
