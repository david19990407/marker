import type {
  BuilderSection,
  PassageConfig,
  PassageLine,
  PassageLineNumberMode,
} from "@/lib/types";

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Math.random().toString(36).slice(2, 11)}`;
}

export function createPassageLine(
  text = "",
  order = 0,
  label: string | null = null,
): PassageLine {
  return { id: newLineId(), order, text, label };
}

/** Logical lines = hard newlines only (not browser wrap). */
export function passageSourceLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

export function linesToContent(lines: PassageLine[]): string {
  return [...lines]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.text)
    .join("\n");
}

export function normalizePassageLines(
  raw: unknown,
  fallbackText = "",
): PassageLine[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item, index) => {
        const obj = (item ?? {}) as Record<string, unknown>;
        const labelRaw = obj.label;
        const label =
          labelRaw == null || String(labelRaw).trim() === ""
            ? null
            : String(labelRaw).trim();
        return {
          id:
            typeof obj.id === "string" && obj.id
              ? obj.id
              : newLineId(),
          order:
            typeof obj.order === "number" && Number.isFinite(obj.order)
              ? obj.order
              : index,
          text: typeof obj.text === "string" ? obj.text : "",
          label,
        } satisfies PassageLine;
      })
      .sort((a, b) => a.order - b.order)
      .map((line, index) => ({ ...line, order: index }));
  }

  return passageSourceLines(fallbackText).map((text, index) =>
    createPassageLine(text, index, null),
  );
}

/** Migrate legacy index/number fields into per-row labels. */
function migrateLegacyLabels(
  lines: PassageLine[],
  config: PassageConfig,
): PassageLine[] {
  const start = Math.max(1, config.starting_line_number || 1);
  const indexes = new Set(config.numbered_line_indexes ?? []);
  const manualNumbers = new Set(config.manual_line_numbers ?? []);
  const legacyMap = config.manual_line_labels ?? {};

  return lines.map((line, index) => {
    if (line.label != null && String(line.label).trim() !== "") return line;

    const fromMap = legacyMap[String(index)];
    if (fromMap != null && String(fromMap).trim() !== "") {
      return { ...line, label: String(fromMap).trim() };
    }

    const display = start + index;
    if (indexes.has(index) || manualNumbers.has(display)) {
      return { ...line, label: String(display) };
    }
    return line;
  });
}

export function normalizePassageConfig(
  raw?: Partial<PassageConfig> | null,
  contentFallback = "",
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

  const lines = normalizePassageLines(raw?.lines, contentFallback);
  // Renderer and editor use only stored per-row labels. Legacy index/number
  // fields are kept for one-time migration helpers but never invent labels here.
  return {
    title: typeof raw?.title === "string" ? raw.title : "",
    source_reference:
      typeof raw?.source_reference === "string" ? raw.source_reference : "",
    show_line_numbers: mode !== "none",
    line_number_mode: mode,
    line_number_interval: interval,
    starting_line_number: Math.max(1, Number(raw?.starting_line_number) || 1),
    numbering_continuation: raw?.numbering_continuation ?? "custom_start",
    manual_line_numbers: Array.isArray(raw?.manual_line_numbers)
      ? raw!.manual_line_numbers!
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.floor(n))
      : [],
    numbered_line_indexes: Array.isArray(raw?.numbered_line_indexes)
      ? raw!.numbered_line_indexes!
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 0)
          .map((n) => Math.floor(n))
      : [],
    manual_line_labels:
      raw?.manual_line_labels && typeof raw.manual_line_labels === "object"
        ? { ...raw.manual_line_labels }
        : {},
    lines,
  };
}

/** One-time helper: copy legacy index/number maps into editable row labels. */
export function migrateLegacyPassageLabels(
  config: PassageConfig,
): PassageConfig {
  const lines = config.lines ?? [];
  if (lines.some((l) => l.label != null && String(l.label).trim() !== "")) {
    return config;
  }
  return {
    ...config,
    line_number_mode: "manual",
    lines: migrateLegacyLabels(lines, config),
  };
}

/**
 * Convenience: populate editable labels from an interval pattern.
 * Never invents labels outside the chosen rows — blank rows stay blank.
 */
export function applyAutomaticLabels(
  lines: PassageLine[],
  mode: "every_line" | "every_5" | "every_10" | "clear",
  start = 1,
): PassageLine[] {
  const interval =
    mode === "every_line" ? 1 : mode === "every_5" ? 5 : mode === "every_10" ? 10 : 0;

  return lines.map((line, index) => {
    if (mode === "clear") return { ...line, label: null };
    if (interval <= 0) return line;
    if (index % interval === 0) {
      return { ...line, label: String(start + index) };
    }
    return { ...line, label: null };
  });
}

export function resolvePassageStart(
  config: PassageConfig,
  previousEnd: number | null,
): number {
  const continuation = config.numbering_continuation ?? "custom_start";
  if (continuation === "continue" && previousEnd != null) {
    return previousEnd + 1;
  }
  if (continuation === "restart") return 1;
  return Math.max(1, config.starting_line_number ?? 1);
}

export type PassageLineRow = {
  id: string;
  logicalIndex: number;
  label: string | null;
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
  const config = normalizePassageConfig(configInput, text);
  void startOverride;
  const lines = config.lines?.length
    ? [...config.lines].sort((a, b) => a.order - b.order)
    : normalizePassageLines(null, text);

  const showGutter = lines.some(
    (l) => l.label != null && String(l.label).trim() !== "",
  );

  const rows: PassageLineRow[] = lines.map((line, index) => {
    const label =
      line.label != null && String(line.label).trim() !== ""
        ? String(line.label).trim()
        : null;
    return {
      id: line.id,
      logicalIndex: index,
      label,
      showNumber: Boolean(label),
      text: line.text,
    };
  });

  const numericLabels = rows
    .map((r) => Number(r.label))
    .filter((n) => Number.isFinite(n));
  const endingLineNumber =
    numericLabels.length > 0 ? Math.max(...numericLabels) : rows.length;

  return {
    rows,
    endingLineNumber,
    start: Math.max(1, config.starting_line_number || 1),
    showGutter,
  };
}

export function getPassageEndingLine(
  text: string,
  configInput?: Partial<PassageConfig> | null,
  startOverride?: number,
): number {
  return buildPassageRows(text, configInput, startOverride).endingLineNumber;
}

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
        const config = normalizePassageConfig(block.passageConfig, block.content);
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

export function splitPassageLine(
  lines: PassageLine[],
  lineId: string,
): PassageLine[] {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((l) => l.id === lineId);
  if (index < 0) return lines;
  const line = sorted[index];
  if (!line.text.trim()) return lines;
  const mid = Math.floor(line.text.length / 2);
  let splitAt = line.text.lastIndexOf(" ", mid);
  if (splitAt < 8) splitAt = line.text.indexOf(" ", mid);
  if (splitAt < 0) splitAt = mid;
  const left = line.text.slice(0, splitAt).trimEnd();
  const right = line.text.slice(splitAt).trimStart();
  const next = [...sorted];
  next.splice(
    index,
    1,
    { ...line, text: left },
    createPassageLine(right, index + 1, null),
  );
  return next.map((l, i) => ({ ...l, order: i }));
}

export function mergePassageLineWithPrevious(
  lines: PassageLine[],
  lineId: string,
): PassageLine[] {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((l) => l.id === lineId);
  if (index <= 0) return lines;
  const next = [...sorted];
  next[index - 1] = {
    ...next[index - 1],
    text: `${next[index - 1].text} ${next[index].text}`.trim(),
  };
  next.splice(index, 1);
  return next.map((l, i) => ({ ...l, order: i }));
}

export function movePassageLineRow(
  lines: PassageLine[],
  lineId: string,
  direction: -1 | 1,
): PassageLine[] {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((l) => l.id === lineId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return lines;
  const next = [...sorted];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((l, i) => ({ ...l, order: i }));
}

export function deletePassageLine(
  lines: PassageLine[],
  lineId: string,
): PassageLine[] {
  const next = lines.filter((l) => l.id !== lineId);
  if (next.length === 0) return [createPassageLine("", 0, null)];
  return next
    .sort((a, b) => a.order - b.order)
    .map((l, i) => ({ ...l, order: i }));
}
