import { describe, expect, it } from "vitest";
import { createBlock, emptySection } from "./structure";
import { filterSectionsForStudents, isStudentVisibleBlock } from "./visibility";

describe("student visibility", () => {
  it("hides empty default-titled sections", () => {
    const section = emptySection();
    section.title = "New section";
    expect(filterSectionsForStudents([section])).toEqual([]);
  });

  it("hides empty image and resource blocks", () => {
    const image = createBlock("image");
    const resource = createBlock("downloadable_resource");
    const heading = createBlock("heading");
    heading.content = "Part A";
    expect(isStudentVisibleBlock(image)).toBe(false);
    expect(isStudentVisibleBlock(resource)).toBe(false);
    expect(isStudentVisibleBlock(heading)).toBe(true);
  });

  it("keeps populated passages and questions", () => {
    const section = emptySection();
    section.title = "Reading";
    const passage = createBlock("passage");
    passage.content = "Once upon a time…";
    const mcq = createBlock("multiple_choice");
    mcq.content = "What happened?";
    section.blocks = [passage, mcq];
    const visible = filterSectionsForStudents([section]);
    expect(visible).toHaveLength(1);
    expect(visible[0].blocks).toHaveLength(2);
  });

  it("keeps teacher-only notes in marking mode only", () => {
    const section = emptySection();
    section.title = "Marking pack";
    const note = createBlock("teacher_instruction");
    note.content = "Look for evidence of analysis";
    note.teacher_only = true;
    section.blocks = [note];
    expect(filterSectionsForStudents([section], "student")).toEqual([]);
    expect(filterSectionsForStudents([section], "teacher_marking")).toHaveLength(
      1,
    );
  });
});
