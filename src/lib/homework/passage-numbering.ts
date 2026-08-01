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

  const indexes = Array.isArray(raw?.numbered_line_indexes)
    ? raw.numbered_line_indexes
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .map((n) => Math.floor(n))
    : [];

  const labels: Record<string, number> = {};
  if (raw?.manual_line_labels && typeof raw.manual_line_labels === "object") {
    for (const [key, value] of Object.entries(raw.manual_line_labels)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) labels[key] = Math.floor(n);
    }
  }

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
    numbered_line_indexes: [...new Set(indexes)].sort((a, b) => a - b),
    manual_line_labels: labels,
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

/** Logical lines = hard newlines only (not browser wrap). */
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
  logicalIndex: number,
  displayNumber: number,
  start: number,
  config: PassageConfig,
): boolean {
  const mode = config.line_number_mode ?? "custom_interval";
  if (mode === "none" || config.show_line_numbers === false) return false;

  if (mode === "manual") {
    const indexes = config.numbered_line_indexes ?? [];
    if (indexes.length > 0) return indexes.includes(logicalIndex);
    const set = new Set(config.manual_line_numbers ?? []);
    return set.has(displayNumber);
  }

  const interval = intervalForMode(config);
  if (interval <= 0) return false;
  return (displayNumber - start) % interval === 0;
}

export type PassageLineRow = {
  logicalIndex: number;
  displayNumber: number;
  showNumber: boolean;
  text: string;
};

export function buildPassageRows(
  text: string,
  configInput?: Partial<PassageConfig> | null,
  startOverride?: number,
): {
  rows: PassageLineRow[];
  endingLineNumber: number;
  start: number;
  showGutter: boolean;
} {
  const config = normalizePassageConfig(configInput);
  const start =
    startOverride != null
      ? Math.max(1, startOverride)
      : resolvePassageStart(config, null);
  const lines = passageSourceLines(text);
  const showGutter =
    config.line_number_mode !== "none" && config.show_line_numbers !== false;

  const rows: PassageLineRow[] = lines.map((line, index) => {
    const defaultNumber = start + index;
    const custom = config.manual_line_labels?.[String(index)];
    const displayNumber =
      custom != null && Number.isFinite(custom) ? Number(custom) : defaultNumber;
    return {
      logicalIndex: index,
      displayNumber,
      showNumber:
        showGutter &&
        shouldShowLineNumber(index, defaultNumber, start, config),
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
        if (
          studentFacing &&
          (block.teacher_only || block.student_visible === false)
        ) {
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

/** Parse comma-separated manual display numbers. Returns error message or values. */
export function parseManualLineNumberList(raw: string): {
  values?: number[];
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { values: [] };
  const parts = trimmed.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return {
        error: `“${part}” is not a whole number. Use commas, e.g. 1, 6, 11, 16.`,
      };
    }
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: "Line numbers must be positive whole numbers." };
    }
    values.push(n);
  }
  const unique = [...new Set(values)];
  const sorted = [...unique].sort((a, b) => a - b);
  if (sorted.join(",") !== unique.join(",")) {
    // allow unsorted input but store ascending
  }
  return { values: sorted };
}

/** Convert display numbers into logical indexes using the passage start. */
export function displayNumbersToIndexes(
  displayNumbers: number[],
  start: number,
  lineCount: number,
): { indexes: number[]; error?: string } {
  const indexes: number[] = [];
  for (const display of displayNumbers) {
    const index = display - start;
    if (index < 0 || index >= lineCount) {
      return {
        indexes: [],
        error: `Number ${display} is outside this passage (valid ${start}–${start + Math.max(lineCount, 1) - 1}).`,
      };
    }
    indexes.push(index);
  }
  return { indexes: [...new Set(indexes)].sort((a, b) => a - b) };
}

export function splitPassageAt(
  text: string,
  lineIndex: number,
): string {
  const lines = passageSourceLines(text);
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  const line = lines[lineIndex];
  if (!line.trim()) return text;
  // Split roughly in half on a space when possible.
  const mid = Math.floor(line.length / 2);
  let splitAt = line.lastIndexOf(" ", mid);
  if (splitAt < 8) splitAt = line.indexOf(" ", mid);
  if (splitAt < 0) splitAt = mid;
  const left = line.slice(0, splitAt).trimEnd();
  const right = line.slice(splitAt).trimStart();
  const next = [...lines];
  next.splice(lineIndex, 1, left, right);
  return next.join("\n");
}

export function mergePassageWithPrevious(
  text: string,
  lineIndex: number,
): string {
  const lines = passageSourceLines(text);
  if (lineIndex <= 0 || lineIndex >= lines.length) return text;
  const next = [...lines];
  next[lineIndex - 1] = `${next[lineIndex - 1]} ${next[lineIndex]}`.trim();
  next.splice(lineIndex, 1);
  return next.join("\n");
}

export function movePassageLine(
  text: string,
  lineIndex: number,
  direction: -1 | 1,
): string {
  const lines = passageSourceLines(text);
  const target = lineIndex + direction;
  if (target < 0 || target >= lines.length) return text;
  const next = [...lines];
  [next[lineIndex], next[target]] = [next[target], next[lineIndex]];
  return next.join("\n");
}
