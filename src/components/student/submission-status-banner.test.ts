import { describe, expect, it } from "vitest";
import { formatSubmittedOn } from "./submission-status-banner";

describe("submission status copy helpers", () => {
  it("formats a clear submitted-on timestamp", () => {
    const text = formatSubmittedOn("2026-08-01T13:44:00.000Z");
    expect(text.toLowerCase()).toContain("august");
    expect(text).toContain("2026");
  });
});
