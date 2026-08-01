import { mediaHasContent } from "@/lib/homework/visibility";
import { resolveMcqOptions } from "@/lib/homework/structure";
import type { BuilderBlock, BuilderSection } from "@/lib/types";

export type PublishWarning = {
  blockId: string;
  message: string;
  /** When true, publish must be refused until fixed. */
  blocking?: boolean;
  /** 1-based assessable question number when applicable. */
  questionNumber?: number;
  /** Human-readable question title. */
  questionTitle?: string;
};

/** Teacher-side warnings before publishing incomplete structured blocks. */
export function collectPublishWarnings(
  sections: BuilderSection[],
): PublishWarning[] {
  const warnings: PublishWarning[] = [];
  let questionNumber = 0;

  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      const isQuestion =
        block.block_type === "multiple_choice" ||
        block.block_type === "multiple_select" ||
        block.block_type === "numeric" ||
        block.block_type === "short_text" ||
        block.block_type === "extended_writing" ||
        block.block_type === "numbered_question" ||
        block.block_type === "file_upload" ||
        block.block_type === "tick_box";
      if (isQuestion) questionNumber += 1;
      const meta = {
        questionNumber: isQuestion ? questionNumber : undefined,
        questionTitle:
          block.content?.trim() ||
          block.prompt?.trim() ||
          block.block_type.replaceAll("_", " "),
      };
      for (const warning of warningsForBlock(block)) {
        warnings.push({ ...warning, ...meta });
      }
    }
    for (const sub of section.subsections) walk(sub);
  }

  for (const section of sections) walk(section);
  return warnings;
}

export function hasBlockingPublishIssues(sections: BuilderSection[]): boolean {
  return collectPublishWarnings(sections).some((w) => w.blocking);
}

export function formatPublishIssueList(warnings: PublishWarning[]): string {
  const blocking = warnings.filter((w) => w.blocking);
  if (!blocking.length) return "";
  return blocking
    .map((w) => {
      const q =
        w.questionNumber != null
          ? `Question ${w.questionNumber}`
          : "Block";
      const title = w.questionTitle ? `, "${w.questionTitle}"` : "";
      return `${q}${title}: ${w.message}`;
    })
    .join("\n");
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
      // Ignore completely empty draft placeholders the teacher has not started.
      if (isEmptyMcqDraft(block)) return [];

      const options = resolveMcqOptions(block);
      const nonEmpty = options.filter((o) => o.label.trim());
      const out: PublishWarning[] = [];
      const multi = block.block_type === "multiple_select";
      const automatic = block.marking_mode === "automatic";

      if (nonEmpty.length < 2) {
        out.push({
          blockId: id,
          message:
            nonEmpty.length === 0
              ? "Add at least two non-empty answer options."
              : "Only one non-empty option exists — add at least two.",
          blocking: true,
        });
      }
      if (options.some((o) => !o.label.trim()) && options.length > 0) {
        out.push({
          blockId: id,
          message: "Every option needs visible text (remove blank options).",
          blocking: true,
        });
      }
      if (automatic) {
        const correctCount = options.filter((o) => o.correct && o.label.trim()).length;
        if (multi) {
          if (correctCount < 1) {
            out.push({
              blockId: id,
              message:
                "Select at least one correct option for automatic marking.",
              blocking: true,
            });
          }
        } else if (correctCount !== 1) {
          out.push({
            blockId: id,
            message:
              correctCount === 0
                ? "Mark exactly one correct option for automatic marking."
                : "Single-choice questions must have exactly one correct option.",
            blocking: true,
          });
        }
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

/** Brand-new unused MCQ: no title and only default empty/placeholder options. */
export function isEmptyMcqDraft(block: BuilderBlock): boolean {
  if (
    block.block_type !== "multiple_choice" &&
    block.block_type !== "multiple_select"
  ) {
    return false;
  }
  const hasTitle = Boolean(block.content?.trim() || block.prompt?.trim());
  if (hasTitle) return false;
  const options = resolveMcqOptions(block);
  if (options.length === 0) return true;
  // Default factory options ("Option A"/"Option B") with no teacher edit still count
  // as drafts only when labels are empty — named defaults are intentional content.
  return options.every((o) => !o.label.trim());
}
