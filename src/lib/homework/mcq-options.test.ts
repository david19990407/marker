import { describe, expect, it } from "vitest";
import {
  formatMcqOptionIdentifier,
  getMcqOptionText,
  mcqOptionHasText,
  normalizeMcqOption,
} from "./mcq-options";

describe("mcq option text helpers", () => {
  it("prefers text over legacy label", () => {
    expect(
      getMcqOptionText({ text: "Shakespeare", label: "Option A" }),
    ).toBe("Shakespeare");
    expect(getMcqOptionText({ label: "Legacy only" } as { label: string })).toBe(
      "Legacy only",
    );
    expect(getMcqOptionText({ text: "", label: "From label" })).toBe("From label");
  });

  it("heals Option A + feedback answer pattern", () => {
    const healed = normalizeMcqOption({
      id: "1",
      label: "Option A",
      feedback: "William Shakespeare",
      correct: true,
    });
    expect(healed.text).toBe("William Shakespeare");
    expect(healed.label).toBe("William Shakespeare");
    expect(healed.feedback).toBe("");
  });

  it("does not steal real answer text into feedback heal", () => {
    const kept = normalizeMcqOption({
      id: "1",
      text: "William Shakespeare",
      feedback: "Good choice",
      correct: true,
    });
    expect(kept.text).toBe("William Shakespeare");
    expect(kept.feedback).toBe("Good choice");
  });

  it("formats identifiers without touching answer text", () => {
    expect(formatMcqOptionIdentifier(0, "letters")).toBe("A");
    expect(formatMcqOptionIdentifier(1, "numbers")).toBe("2");
    expect(formatMcqOptionIdentifier(2, "roman")).toBe("iii");
  });

  it("treats blank option text as empty for validation", () => {
    expect(mcqOptionHasText({ text: "  " })).toBe(false);
    expect(mcqOptionHasText({ text: "Charles Dickens" })).toBe(true);
  });
});
