import type {
  BuilderSection,
  PassageConfig,
  PassageLineNumberMode,
} from "@/lib/types";

export function normalizePassageConfig(
  raw?: Partial<PassageConfig> | null,
): PassageConfig {
  const interval = Math.max(1, Number(raw?.line_number_interval) || 5);
  let mode = raw?.line_number_mode as PassageLineNumberMode | undefined;

  if (!mode) {
    if (raw?.show_line_numbers === false) mode = "none";
    else if (interval === 1) mode = "every_line";
    else if (interval === 5) mode = "every_5";
    else if (interval === 10) mode = "every_10";
    else mode = "custom_interval";
  }

  const manual = Array.isArray(raw?.manual_line_numbers)
    ? raw.manual_line_numbers
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n))
    : [];

  return {
    title: typeof raw?.title === "string" ? raw.title : "",
    source_reference:
      typeof raw?.source_reference === "string" ? raw.source_reference : "",
    show_line_numbers: mode !== "none",
    line_number_mode: mode,
    line_number_interval: interval,
    starting_line_number: Math.max(1, Number(raw?.starting_line_number) || 1),
    numbering_continuation: raw?.numbering_continuation ?? "custom_start",
    manual_line_numbers: [...new Set(manual)].sort((a, b) => a - b),
  };
}

export function resolvePassageStart(
  config: PassageConfig,
  previousEnd: number | null,
): number {
  const continuation = config.numbering_continuation ?? "custom_start";
  if (continuation === "continue" && previousEnd != null) {
    return previousEnd + 1;
  }
  if (continuation === "restart") {
    return 1;
  }
  return Math.max(1, config.starting_line_number ?? 1);
}

export function passageSourceLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function intervalForMode(config: PassageConfig): number {
  switch (config.line_number_mode) {
    case "none":
      return 0;
    case "every_line":
      return 1;
    case "every_5":
      return 5;
    case "every_10":
      return 10;
    case "custom_interval":
      return Math.max(1, config.line_number_interval || 1);
    case "manual":
      return 0;
    default:
      return Math.max(1, config.line_number_interval || 5);
  }
}

export function shouldShowLineNumber(
  displayNumber: number,
  start: number,
  config: PassageConfig,
): boolean {
  const mode = config.line_number_mode ?? "custom_interval";
  if (mode === "none" || config.show_line_numbers === false) return false;
  if (mode === "manual") {
    const set = new Set(config.manual_line_numbers ?? []);
    return set.has(displayNumber);
  }
  const interval = intervalForMode(config);
  if (interval <= 0) return false;
  return (displayNumber - start) % interval === 0;
}

export type PassageLineRow = {
  displayNumber: number;
  showNumber: boolean;
  text: string;
};

export function buildPassageRows(
  text: string,
  configInput?: Partial<PassageConfig> | null,
  startOverride?: number,
): { rows: PassageLineRow[]; endingLineNumber: number; start: number; showGutter: boolean } {
  const config = normalizePassageConfig(configInput);
  const start =
    startOverride != null
      ? Math.max(1, startOverride)
      : resolvePassageStart(config, null);
  const lines = passageSourceLines(text);
  const showGutter = config.line_number_mode !== "none" && config.show_line_numbers !== false;

  const rows: PassageLineRow[] = lines.map((line, index) => {
    const displayNumber = start + index;
    return {
      displayNumber,
      showNumber: showGutter && shouldShowLineNumber(displayNumber, start, config),
      text: line,
    };
  });

  const endingLineNumber =
    rows.length === 0 ? start - 1 : start + rows.length - 1;

  return { rows, endingLineNumber, start, showGutter };
}

export function getPassageEndingLine(
  text: string,
  configInput?: Partial<PassageConfig> | null,
  startOverride?: number,
): number {
  return buildPassageRows(text, configInput, startOverride).endingLineNumber;
}

/** Document-order start line for each passage, honouring continue/restart. */
export function computePassageStartLines(
  sections: BuilderSection[],
  options?: { studentFacing?: boolean },
): Map<string, number> {
  const starts = new Map<string, number>();
  let previousEnd: number | null = null;
  const studentFacing = options?.studentFacing ?? false;

  function walk(list: BuilderSection[]) {
    for (const section of list) {
      for (const block of section.blocks) {
        if (block.block_type !== "passage") continue;
        if (studentFacing && (block.teacher_only || block.student_visible === false)) {
          continue;
        }
        const config = normalizePassageConfig(block.passageConfig);
        const start = resolvePassageStart(config, previousEnd);
        starts.set(block._id, start);
        previousEnd = getPassageEndingLine(block.content, config, start);
      }
      walk(section.subsections);
    }
  }

  walk(sections);
  return starts;
}
