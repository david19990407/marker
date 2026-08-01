import { mediaHasContent } from "@/lib/homework/visibility";
import { resolveMcqOptions } from "@/lib/homework/structure";
import type { BuilderBlock, BuilderSection } from "@/lib/types";

export type PublishWarning = {
  blockId: string;
  message: string;
  /** When true, publish must be refused until fixed. */
  blocking?: boolean;
};

/** Teacher-side warnings before publishing incomplete structured blocks. */
export function collectPublishWarnings(
  sections: BuilderSection[],
): PublishWarning[] {
  const warnings: PublishWarning[] = [];

  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      warnings.push(...warningsForBlock(block));
    }
    for (const sub of section.subsections) walk(sub);
  }

  for (const section of sections) walk(section);
  return warnings;
}

export function hasBlockingPublishIssues(sections: BuilderSection[]): boolean {
  return collectPublishWarnings(sections).some((w) => w.blocking);
}

function warningsForBlock(block: BuilderBlock): PublishWarning[] {
  const id = block._id;
  const label = block.content?.trim() || block.prompt?.trim() || block.block_type;

  switch (block.block_type) {
    case "image":
    case "embedded_video":
    case "downloadable_resource":
      if (!mediaHasContent(block)) {
        return [
          {
            blockId: id,
            message: `${label}: add a file or URL before students can see this block.`,
          },
        ];
      }
      return [];
    case "multiple_choice":
    case "multiple_select": {
      const options = resolveMcqOptions(block);
      const out: PublishWarning[] = [];
      if (options.length < 2) {
        out.push({
          blockId: id,
          message: `${label}: add at least two answer options.`,
          blocking: true,
        });
      }
      if (!options.some((o) => o.correct) && block.marking_mode === "automatic") {
        out.push({
          blockId: id,
          message: `${label}: mark a correct answer for automatic marking.`,
          blocking: true,
        });
      }
      if (options.some((o) => !o.label.trim())) {
        out.push({
          blockId: id,
          message: `${label}: every option needs visible text.`,
          blocking: true,
        });
      }
      return out;
    }
    case "numeric":
      if (!block.content?.trim() && !block.prompt?.trim()) {
        return [
          {
            blockId: id,
            message: "Numeric response: add a question title or instructions.",
          },
        ];
      }
      if (
        block.marking_mode === "automatic" &&
        !block.correct_answer &&
        block.numericConfig?.correct_min == null &&
        block.numericConfig?.correct_max == null
      ) {
        return [
          {
            blockId: id,
            message: `${label}: set a correct answer or accepted range for automatic marking.`,
          },
        ];
      }
      return [];
    case "short_text":
    case "extended_writing":
    case "numbered_question":
    case "file_upload":
    case "tick_box":
      if (!block.content?.trim() && !block.prompt?.trim()) {
        return [
          {
            blockId: id,
            message: `${block.block_type.replaceAll("_", " ")}: add question text before publishing.`,
          },
        ];
      }
      return [];
    default:
      return [];
  }
}
