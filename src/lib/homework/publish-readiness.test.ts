import { describe, expect, it } from "vitest";
import { createBlock, emptySection } from "./structure";
import { collectPublishWarnings } from "./publish-readiness";

describe("collectPublishWarnings", () => {
  it("flags empty media and incomplete MCQs", () => {
    const section = emptySection();
    section.title = "Unit 1";
    const image = createBlock("image");
    const mcq = createBlock("multiple_choice");
    mcq.content = "Pick one";
    mcq.mcq_options = [{ id: "only", label: "A", correct: false }];
    mcq.marking_mode = "automatic";
    section.blocks = [image, mcq];

    const warnings = collectPublishWarnings([section]);
    expect(warnings.some((w) => w.message.includes("file or URL"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("two answer options"))).toBe(
      true,
    );
  });
});
