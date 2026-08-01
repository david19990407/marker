import { isResponseType } from "@/lib/homework/structure";
import type { BuilderBlock, BuilderSection, MediaConfig } from "@/lib/types";

const DEFAULT_SECTION_TITLES = new Set([
  "new section",
  "new subsection",
  "section",
  "subsection",
]);

export type VisibilityMode =
  | "student"
  | "teacher_preview"
  | "teacher_marking";

export function isDefaultSectionTitle(title: string | null | undefined): boolean {
  return DEFAULT_SECTION_TITLES.has((title ?? "").trim().toLowerCase());
}

export function getMediaConfig(block: BuilderBlock): MediaConfig {
  return (
    block.mediaConfig ?? {
      external_url: block.external_url ?? null,
      transcript: block.captions_text ?? null,
      allow_download: block.allow_download ?? true,
      title: block.content || null,
      description: block.prompt ?? null,
    }
  );
}

export function mediaHasContent(block: BuilderBlock): boolean {
  const media = getMediaConfig(block);
  const url = (media.external_url || block.external_url || "").trim();
  const path = (media.storage_path || "").trim();
  if (block.block_type === "image") {
    return Boolean(path || url || block.content.startsWith("http"));
  }
  if (block.block_type === "embedded_video") {
    return Boolean(path || url);
  }
  if (block.block_type === "downloadable_resource") {
    return Boolean(path || url || block.content.startsWith("http"));
  }
  return true;
}

/** Whether a block is complete enough to show to students. */
export function isStudentVisibleBlock(block: BuilderBlock): boolean {
  return isVisibleBlock(block, "student");
}

export function isVisibleBlock(
  block: BuilderBlock,
  mode: VisibilityMode = "student",
): boolean {
  const marking = mode === "teacher_marking";

  if (!marking) {
    if (block.teacher_only || block.student_visible === false) return false;
    if (block.block_type === "mark_scheme") return false;
  }

  switch (block.block_type) {
    case "heading":
    case "subheading":
    case "instruction":
    case "rich_text":
    case "teacher_instruction":
    case "moderation_note":
    case "mark_scheme":
      return Boolean(block.content?.trim() || block.prompt?.trim());
    case "divider":
    case "page_break":
      return true;
    case "passage":
      return Boolean(block.content?.trim());
    case "image":
    case "embedded_video":
    case "downloadable_resource":
    case "staff_resource":
      return mediaHasContent(block) || Boolean(block.content?.trim());
    case "tick_box":
      return Boolean(block.content?.trim() || block.prompt?.trim());
    default:
      if (isResponseType(block.block_type)) {
        return Boolean(
          block.content?.trim() ||
            block.prompt?.trim() ||
            (block.mcq_options?.length ?? 0) > 0 ||
            block.tableConfig,
        );
      }
      return Boolean(block.content?.trim() || block.prompt?.trim());
  }
}

function sectionHasVisibleContent(
  section: BuilderSection,
  mode: VisibilityMode,
): boolean {
  const hasBlocks = section.blocks.some((b) => isVisibleBlock(b, mode));
  const hasSubs = section.subsections.some((s) =>
    sectionHasVisibleContent(s, mode),
  );
  return hasBlocks || hasSubs;
}

/**
 * Strip empty draft placeholders for student-facing / marking views.
 * Teachers still see raw sections in the builder.
 */
export function filterSectionsForStudents(
  sections: BuilderSection[],
  mode: VisibilityMode = "student",
): BuilderSection[] {
  return sections
    .map((section) => {
      const subsections = filterSectionsForStudents(section.subsections, mode);
      const blocks = section.blocks.filter((b) => isVisibleBlock(b, mode));
      return { ...section, blocks, subsections };
    })
    .filter((section) => {
      if (!sectionHasVisibleContent(section, mode)) return false;
      // Hide unfinished default-titled shells with no real content.
      if (
        isDefaultSectionTitle(section.title) &&
        section.blocks.length === 0 &&
        section.subsections.length === 0
      ) {
        return false;
      }
      return true;
    });
}
