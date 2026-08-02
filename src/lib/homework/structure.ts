import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentBlockType,
  BuilderBlock,
  BuilderSection,
  MediaConfig,
  McqOption,
  NumericConfig,
  TableCellDef,
  TableConfig,
} from "@/lib/types";
import {
  RESPONSE_BLOCK_TYPES as RESPONSE_TYPES,
  defaultScannedUploadConfig,
} from "@/lib/types";
import {
  getMcqOptionText,
  normalizeMcqOption,
  normalizeMcqOptions,
  normalizeOptionLabelStyle,
} from "@/lib/homework/mcq-options";
import {
  linesToContent,
  migrateLegacyPassageLabels,
  normalizePassageConfig,
} from "@/lib/homework/passage-numbering";

// ── Identity helpers ─────────────────────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID();
}

/** Duplicate a block as new content with fresh stable IDs. */
export function cloneBlock(block: BuilderBlock): BuilderBlock {
  const isResponse = isResponseType(block.block_type);
  return {
    ...block,
    _id: newId(),
    question_id: isResponse ? newId() : null,
    cells: block.cells?.map((c) => ({ ...c })),
    choices: block.choices ? [...block.choices] : undefined,
    mcq_options: block.mcq_options?.map((o) => ({ ...o, id: newId() })),
    option_feedback: block.option_feedback ? [...block.option_feedback] : undefined,
    correct_option_indexes: block.correct_option_indexes
      ? [...block.correct_option_indexes]
      : undefined,
    passage_block_ids: block.passage_block_ids ? [...block.passage_block_ids] : undefined,
    // Do not silently copy comment-bank links onto duplicates.
    linked_comment_bank_ids: [],
    passageConfig: block.passageConfig
      ? {
          ...block.passageConfig,
          lines: block.passageConfig.lines?.map((line) => ({ ...line })),
          manual_line_numbers: block.passageConfig.manual_line_numbers
            ? [...block.passageConfig.manual_line_numbers]
            : undefined,
          numbered_line_indexes: block.passageConfig.numbered_line_indexes
            ? [...block.passageConfig.numbered_line_indexes]
            : undefined,
          manual_line_labels: block.passageConfig.manual_line_labels
            ? { ...block.passageConfig.manual_line_labels }
            : undefined,
        }
      : undefined,
    mediaConfig: block.mediaConfig ? { ...block.mediaConfig } : undefined,
    scannedUploadConfig: block.scannedUploadConfig
      ? {
          ...block.scannedUploadConfig,
          subquestions: block.scannedUploadConfig.subquestions.map((q) => ({
            ...q,
            id: newId(),
          })),
        }
      : undefined,
    numericConfig: block.numericConfig ? { ...block.numericConfig } : undefined,
    tableConfig: block.tableConfig
      ? { ...block.tableConfig, col_labels: [...block.tableConfig.col_labels] }
      : undefined,
  };
}

export function cloneSection(section: BuilderSection, titleSuffix = " (copy)"): BuilderSection {
  return {
    ...section,
    _id: newId(),
    title: `${section.title}${titleSuffix}`,
    blocks: section.blocks.map((b) => cloneBlock(b)),
    subsections: section.subsections.map((s) => cloneSection(s, "")),
  };
}

// ── Factory helpers ──────────────────────────────────────────────────────────

export function defaultTableConfig(rows = 3, cols = 2): TableConfig {
  return {
    rows,
    cols,
    header_row: true,
    col_labels: Array.from({ length: cols }, (_, i) => `Column ${i + 1}`),
  };
}

export function defaultTableCells(rows: number, cols: number): TableCellDef[] {
  const cells: TableCellDef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        row_index: r,
        col_index: c,
        cell_type: "student_text",
        label: null,
        marks: null,
        read_only: false,
      });
    }
  }
  return cells;
}

/** Vocabulary preset: Word | Define it | Apply it */
export function createVocabularyTableBlock(): BuilderBlock {
  const rows = 5;
  const cols = 3;
  const cells = defaultTableCells(rows, cols);

  // Header row labels live in col_labels; row 0 is header when header_row=true
  // Pre-fill word column (col 0) as readonly instructional for data rows,
  // leaving Define/Apply as student_text.
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells.find((x) => x.row_index === r && x.col_index === c)!;
      if (c === 0) {
        cell.cell_type = "readonly";
        cell.read_only = true;
        cell.label = "";
      } else {
        cell.cell_type = "student_text";
        cell.read_only = false;
      }
    }
  }

  return {
    _id: newId(),
    question_id: newId(),
    block_type: "vocabulary_table",
    content: "Vocabulary",
    teacher_only: false,
    prompt: "Complete the vocabulary table",
    max_marks: null,
    marks_apply: true,
    required: false,
    table_marks_mode: "none",
    tableConfig: {
      rows,
      cols,
      header_row: true,
      col_labels: ["Word", "Define it", "Apply it"],
    },
    cells,
  };
}

export function createBlock(type: AssignmentBlockType): BuilderBlock {
  if (type === "vocabulary_table") {
    return createVocabularyTableBlock();
  }

  const isTeacherOnly = isTeacherOnlyType(type);
  const base: BuilderBlock = {
    _id: newId(),
    question_id: isResponseType(type) ? newId() : null,
    block_type: type,
    content: "",
    teacher_only: isTeacherOnly,
    student_visible: !isTeacherOnly,
    review_only: type === "teacher_review",
    allow_attachments:
      type === "file_upload" || type === "scanned_homework_upload",
    marks_apply: isResponseType(type) && type !== "teacher_review",
  };

  if (type === "passage") {
    base.content = "";
    base.prompt = "";
    base.passageConfig = normalizePassageConfig(
      {
        title: "",
        source_reference: "",
        show_line_numbers: true,
        line_number_mode: "manual",
        line_number_interval: 5,
        starting_line_number: 1,
        numbering_continuation: "custom_start",
        lines: [],
      },
      "",
    );
  }

  if (type === "embedded_video") {
    base.external_url = "";
    base.captions_text = "";
    base.allow_download = false;
    base.mediaConfig = {
      external_url: "",
      title: "",
      description: "",
      transcript: "",
      allow_download: false,
      alignment: "center",
      display_size: "full",
    };
  }

  if (type === "image") {
    base.mediaConfig = {
      alt_text: "",
      caption: "",
      alignment: "center",
      display_size: "large",
      allow_download: true,
    };
  }

  if (type === "downloadable_resource") {
    base.mediaConfig = {
      title: "",
      description: "",
      allow_download: true,
      alignment: "left",
      display_size: "full",
    };
  }

  if (isResponseType(type)) {
    base.prompt = "";
    base.max_marks = type === "teacher_review" ? null : 1;
    base.required = type !== "teacher_review";
    base.teacher_note = null;
    base.mark_scheme_note = null;
    base.word_limit = null;
    base.char_limit = null;
    base.suggested_minutes = null;
    base.min_value = null;
    base.max_value = null;
    base.correct_answer = null;
    base.passage_block_ids = [];
    base.linked_comment_bank_ids = [];
    base.marking_mode = "teacher_reviewed";

    if (type === "numeric") {
      base.numericConfig = {
        allow_decimals: true,
        decimal_places: null,
        unit: null,
        correct_min: null,
        correct_max: null,
      };
    }

    if (type === "multiple_choice" || type === "multiple_select") {
      base.mcq_options = normalizeMcqOptions([
        { id: newId(), text: "", correct: true, feedback: "" },
        { id: newId(), text: "", correct: false, feedback: "" },
        { id: newId(), text: "", correct: false, feedback: "" },
        { id: newId(), text: "", correct: false, feedback: "" },
      ]);
      base.choices = base.mcq_options.map((o) => getMcqOptionText(o));
      base.correct_option_indexes = [0];
      base.option_feedback = ["", "", "", ""];
      base.shuffle_options = false;
      base.option_label_style = "letters";
      base.marking_mode = "automatic";
    } else {
      base.choices = [];
    }
  }

  if (type === "table") {
    const rows = 3;
    const cols = 3;
    base.tableConfig = defaultTableConfig(rows, cols);
    base.cells = defaultTableCells(rows, cols);
    base.prompt = "";
    base.max_marks = null;
    base.required = false;
    base.table_marks_mode = "none";
  }

  if (type === "scanned_homework_upload") {
    base.content = "Upload scanned or handwritten work";
    base.prompt =
      "Upload a clear scan or photograph of your handwritten work (PDF, JPG or PNG).";
    base.max_marks = 8;
    base.required = true;
    base.scannedUploadConfig = defaultScannedUploadConfig();
  }

  return base;
}

export function emptySection(): BuilderSection {
  return {
    _id: newId(),
    title: "New section",
    blocks: [],
    subsections: [],
  };
}

// ── MCQ helpers ──────────────────────────────────────────────────────────────

export function resolveMcqOptions(block: BuilderBlock): McqOption[] {
  if (block.mcq_options?.length) {
    return normalizeMcqOptions(block.mcq_options);
  }
  return (block.choices ?? []).map((choice, i) => {
    if (typeof choice === "string") {
      return normalizeMcqOption(
        {
          id: `opt-${i}`,
          text: choice,
          correct: (block.correct_option_indexes ?? []).includes(i),
          feedback: block.option_feedback?.[i] ?? "",
        },
        i,
      );
    }
    if (choice && typeof choice === "object") {
      const obj = choice as Record<string, unknown>;
      return normalizeMcqOption(
        {
          id: typeof obj.id === "string" ? obj.id : `opt-${i}`,
          text:
            obj.text != null
              ? String(obj.text)
              : obj.label != null
                ? String(obj.label)
                : "",
          feedback:
            typeof obj.feedback === "string"
              ? obj.feedback
              : (block.option_feedback?.[i] ?? ""),
          correct:
            typeof obj.is_correct === "boolean"
              ? obj.is_correct
              : typeof obj.correct === "boolean"
                ? obj.correct
                : (block.correct_option_indexes ?? []).includes(i),
        },
        i,
      );
    }
    return normalizeMcqOption(
      {
        id: `opt-${i}`,
        text: "",
        correct: (block.correct_option_indexes ?? []).includes(i),
        feedback: block.option_feedback?.[i] ?? "",
      },
      i,
    );
  });
}

export function normalizeNumericConfig(
  raw?: Partial<NumericConfig> | null,
): NumericConfig {
  return {
    allow_decimals: raw?.allow_decimals !== false,
    decimal_places:
      raw?.decimal_places != null && Number.isFinite(Number(raw.decimal_places))
        ? Math.max(0, Math.floor(Number(raw.decimal_places)))
        : null,
    unit: typeof raw?.unit === "string" && raw.unit.trim() ? raw.unit.trim() : null,
    correct_min:
      raw?.correct_min != null && Number.isFinite(Number(raw.correct_min))
        ? Number(raw.correct_min)
        : null,
    correct_max:
      raw?.correct_max != null && Number.isFinite(Number(raw.correct_max))
        ? Number(raw.correct_max)
        : null,
  };
}

export function normalizeMediaConfig(
  raw?: Partial<MediaConfig> | null,
  fallback?: Partial<MediaConfig>,
): MediaConfig {
  const src = { ...fallback, ...raw };
  return {
    storage_path: typeof src.storage_path === "string" ? src.storage_path : null,
    file_name: typeof src.file_name === "string" ? src.file_name : null,
    mime_type: typeof src.mime_type === "string" ? src.mime_type : null,
    file_size:
      src.file_size != null && Number.isFinite(Number(src.file_size))
        ? Number(src.file_size)
        : null,
    external_url: typeof src.external_url === "string" ? src.external_url : null,
    alt_text: typeof src.alt_text === "string" ? src.alt_text : null,
    caption: typeof src.caption === "string" ? src.caption : null,
    title: typeof src.title === "string" ? src.title : null,
    description: typeof src.description === "string" ? src.description : null,
    transcript: typeof src.transcript === "string" ? src.transcript : null,
    alignment:
      src.alignment === "left" || src.alignment === "right" || src.alignment === "center"
        ? src.alignment
        : "center",
    display_size:
      src.display_size === "small" ||
      src.display_size === "medium" ||
      src.display_size === "large" ||
      src.display_size === "full"
        ? src.display_size
        : "large",
    allow_download: src.allow_download !== false,
    resource_id: typeof src.resource_id === "string" ? src.resource_id : null,
  };
}

export function applyMcqOptions(block: BuilderBlock, options: McqOption[]): BuilderBlock {
  const multi = block.block_type === "multiple_select";
  const normalised = normalizeMcqOptions(options);
  const correctIndexes = normalised
    .map((o, i) => (o.correct ? i : -1))
    .filter((i) => i >= 0);
  const correctTexts = normalised
    .filter((o) => o.correct)
    .map((o) => getMcqOptionText(o));
  return {
    ...block,
    mcq_options: normalised,
    choices: normalised.map((o) => getMcqOptionText(o)),
    option_feedback: normalised.map((o) => o.feedback ?? ""),
    correct_option_indexes: correctIndexes,
    option_label_style: normalizeOptionLabelStyle(block.option_label_style),
    correct_answer: multi
      ? correctTexts.join("\n") || null
      : (correctTexts[0] ?? null),
  };
}

// ── Predicate helpers ────────────────────────────────────────────────────────

export function isResponseType(t: AssignmentBlockType): boolean {
  return (RESPONSE_TYPES as readonly AssignmentBlockType[]).includes(t);
}

export function isTeacherOnlyType(t: AssignmentBlockType): boolean {
  return (
    t === "mark_scheme" ||
    t === "teacher_review" ||
    t === "teacher_instruction" ||
    t === "moderation_note" ||
    t === "staff_resource"
  );
}

export function responseKey(block: BuilderBlock): string {
  return block.question_id || block._id;
}

// ── Payload serialisation ────────────────────────────────────────────────────

type BlockPayload = Record<string, unknown>;

type SectionPayload = {
  id: string;
  title: string;
  blocks: BlockPayload[];
  subsections: SectionPayload[];
};

function blockToPayload(b: BuilderBlock): BlockPayload {
  const config: Record<string, unknown> = {};
  let content = b.content;

  if (b.passageConfig || b.block_type === "passage") {
    const passage = normalizePassageConfig(b.passageConfig, b.content);
    if (passage.lines?.length) {
      content = linesToContent(passage.lines);
    }
    config.passage = passage;
  }
  if (b.mediaConfig) config.media = b.mediaConfig;
  if (b.numericConfig) config.numeric = b.numericConfig;
  let scannedTotalMarks: number | null = null;
  if (b.scannedUploadConfig) {
    const subquestions = b.scannedUploadConfig.subquestions ?? [];
    config.scanned_upload = {
      ...b.scannedUploadConfig,
      subquestions,
    };
    if (subquestions.length > 0) {
      // Mode B: total is derived from attached questions.
      scannedTotalMarks = subquestions
        .filter((q) => q.include_in_total)
        .reduce((sum, q) => sum + Number(q.maximum_mark || 0), 0);
    }
  }
  const mediaUrl = b.mediaConfig?.external_url ?? b.external_url;
  if (mediaUrl) config.external_url = mediaUrl;
  const transcript = b.mediaConfig?.transcript ?? b.captions_text;
  if (transcript) config.captions_text = transcript;
  if (b.mediaConfig?.allow_download != null) {
    config.allow_download = b.mediaConfig.allow_download;
  } else if (b.allow_download != null) {
    config.allow_download = b.allow_download;
  }
  if (b.linked_comment_bank_ids) {
    config.linked_comment_bank_ids = b.linked_comment_bank_ids;
  }
  if (b.option_label_style) {
    config.option_label_style = normalizeOptionLabelStyle(b.option_label_style);
  }

  if (
    (b.block_type === "table" || b.block_type === "vocabulary_table") &&
    b.tableConfig
  ) {
    Object.assign(config, b.tableConfig as unknown as Record<string, unknown>);
  }

  const payload: BlockPayload = {
    id: b._id,
    block_type: b.block_type,
    content,
    teacher_only: b.teacher_only || b.student_visible === false,
    config,
  };

  if (isResponseType(b.block_type)) {
    const options = resolveMcqOptions(b);
    const correctIndexes = options
      .map((o, i) => (o.correct ? i : -1))
      .filter((i) => i >= 0);
    const correctTexts = options
      .filter((o) => o.correct)
      .map((o) => getMcqOptionText(o));
    const isMulti = b.block_type === "multiple_select";
    const isMcq =
      b.block_type === "multiple_choice" || b.block_type === "multiple_select";

    payload.question_id = b.question_id ?? null;
    payload.prompt = b.prompt ?? "";
    payload.max_marks =
      scannedTotalMarks != null ? scannedTotalMarks : (b.max_marks ?? null);
    payload.required = b.required ?? false;
    // Persist full option objects; `text` is canonical answer content.
    payload.choices = isMcq
      ? options.map((o) => {
          const text = getMcqOptionText(o);
          return {
            id: o.id,
            text,
            label: text,
            feedback: o.feedback ?? "",
            is_correct: !!o.correct,
          };
        })
      : options.map((o) => {
          const text = getMcqOptionText(o);
          return { text, label: text };
        });
    payload.response_type = b.block_type;
    payload.teacher_note = b.teacher_note ?? null;
    payload.mark_scheme_note = b.mark_scheme_note ?? null;
    payload.word_limit = b.word_limit ?? null;
    payload.char_limit = b.char_limit ?? null;
    payload.allow_attachments = b.allow_attachments ?? false;
    payload.min_value = b.min_value ?? null;
    payload.max_value = b.max_value ?? null;
    if (isMcq) {
      config.option_label_style = normalizeOptionLabelStyle(b.option_label_style);
      payload.correct_answer = isMulti
        ? { indexes: correctIndexes, labels: correctTexts }
        : {
            value: correctTexts[0] ?? b.correct_answer ?? null,
            indexes: correctIndexes,
          };
    } else if (b.block_type === "numeric") {
      const numeric = normalizeNumericConfig(b.numericConfig);
      payload.correct_answer = {
        value: b.correct_answer,
        min: numeric.correct_min,
        max: numeric.correct_max,
        allow_decimals: numeric.allow_decimals,
        decimal_places: numeric.decimal_places,
        unit: numeric.unit,
      };
      payload.min_value = b.min_value ?? null;
      payload.max_value = b.max_value ?? null;
    } else if (b.correct_answer) {
      payload.correct_answer = { value: b.correct_answer };
    } else {
      payload.correct_answer = null;
    }
    payload.review_only = b.review_only ?? b.block_type === "teacher_review";
    payload.marks_apply = b.marks_apply ?? true;
    payload.marking_mode = b.marking_mode ?? "teacher_reviewed";
    payload.shuffle_options = b.shuffle_options ?? false;
    payload.suggested_minutes = b.suggested_minutes ?? null;
    payload.passage_block_ids = b.passage_block_ids ?? [];
    payload.option_feedback = options.map((o) => o.feedback ?? "");
    payload.correct_option_indexes = correctIndexes;
    payload.table_marks_mode = b.table_marks_mode ?? "none";
    payload.table_total_marks = b.table_total_marks ?? null;
  }

  if (b.block_type === "table" || b.block_type === "vocabulary_table") {
    payload.cells = b.cells ?? [];
  }

  return payload;
}

function sectionToPayload(s: BuilderSection): SectionPayload {
  return {
    id: s._id,
    title: s.title,
    blocks: s.blocks.map(blockToPayload),
    subsections: s.subsections.map(sectionToPayload),
  };
}

/** Serialise builder state into the JSON expected by save_assignment_structure RPC */
export function structureToPayload(sections: BuilderSection[]): SectionPayload[] {
  return sections.map(sectionToPayload);
}

// ── DB load ──────────────────────────────────────────────────────────────────

type DbQuestion = {
  id: string;
  prompt: string;
  max_marks: number | null;
  required: boolean;
  response_type: string;
  choices: unknown;
  sort_order: number;
  teacher_note?: string | null;
  mark_scheme_note?: string | null;
  word_limit?: number | null;
  char_limit?: number | null;
  allow_attachments?: boolean | null;
  min_value?: number | null;
  max_value?: number | null;
  correct_answer?: unknown;
  comment_bank_key?: string | null;
  review_only?: boolean | null;
  marks_apply?: boolean | null;
  marking_mode?: string | null;
  shuffle_options?: boolean | null;
  suggested_minutes?: number | null;
  passage_block_ids?: unknown;
  option_feedback?: unknown;
  correct_option_indexes?: unknown;
  table_marks_mode?: string | null;
  table_total_marks?: number | null;
  unit?: string | null;
  decimal_places?: number | null;
  allow_decimals?: boolean | null;
};

type DbTableCell = {
  row_index: number;
  col_index: number;
  cell_type: string;
  label: string | null;
  marks: number | null;
  read_only: boolean;
};

type DbBlock = {
  id: string;
  section_id: string;
  block_type: string;
  sort_order: number;
  content: string;
  config: Record<string, unknown> | null;
  teacher_only: boolean;
  /**
   * PostgREST returns a one-to-one embed as an object (unique block_id),
   * and may historically return an array. Accept both.
   */
  assignment_questions: DbQuestion | DbQuestion[] | null;
  assignment_table_cells: DbTableCell[] | DbTableCell | null;
};

/**
 * Normalise a PostgREST embed that may be an object (one-to-one) or array.
 * Critical: `unique` FK embeds are objects — reading `[0]` drops the row.
 */
export function firstEmbeddedRecord<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function asEmbeddedArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

type DbSection = {
  id: string;
  template_id: string;
  parent_section_id: string | null;
  title: string;
  sort_order: number;
  blocks: DbBlock[];
};

function dbBlockToBuilder(b: DbBlock): BuilderBlock {
  const bt = b.block_type as AssignmentBlockType;
  const q = firstEmbeddedRecord(b.assignment_questions);
  const cfg = b.config ?? {};
  const block: BuilderBlock = {
    _id: b.id,
    question_id: q?.id ?? null,
    block_type: bt,
    content: b.content,
    teacher_only: b.teacher_only,
    student_visible: !b.teacher_only,
    external_url: typeof cfg.external_url === "string" ? cfg.external_url : null,
    captions_text: typeof cfg.captions_text === "string" ? cfg.captions_text : null,
    allow_download: typeof cfg.allow_download === "boolean" ? cfg.allow_download : true,
    linked_comment_bank_ids: Array.isArray(cfg.linked_comment_bank_ids)
      ? (cfg.linked_comment_bank_ids as string[])
      : [],
    option_label_style: normalizeOptionLabelStyle(
      typeof cfg.option_label_style === "string" ? cfg.option_label_style : null,
    ),
  };

  if (cfg.passage && typeof cfg.passage === "object") {
    // One-time: copy legacy index maps into editable row labels if none exist.
    block.passageConfig = migrateLegacyPassageLabels(
      normalizePassageConfig(
        cfg.passage as Record<string, unknown>,
        b.content,
      ),
    );
    if (block.passageConfig.lines?.length) {
      block.content = linesToContent(block.passageConfig.lines);
    }
  } else if (bt === "passage") {
    block.passageConfig = migrateLegacyPassageLabels(
      normalizePassageConfig(null, b.content),
    );
  }

  if (cfg.media && typeof cfg.media === "object") {
    block.mediaConfig = normalizeMediaConfig(cfg.media as MediaConfig, {
      external_url: block.external_url,
      transcript: block.captions_text,
      allow_download: block.allow_download,
      title: block.content,
      description: block.prompt ?? null,
    });
  } else if (
    bt === "image" ||
    bt === "embedded_video" ||
    bt === "downloadable_resource"
  ) {
    block.mediaConfig = normalizeMediaConfig(null, {
      external_url: block.external_url,
      transcript: block.captions_text,
      allow_download: block.allow_download,
      title: block.content,
      description: block.prompt ?? null,
      storage_path:
        typeof cfg.storage_path === "string" ? cfg.storage_path : null,
      file_name: typeof cfg.file_name === "string" ? cfg.file_name : null,
      mime_type: typeof cfg.mime_type === "string" ? cfg.mime_type : null,
    });
  }

  if (cfg.numeric && typeof cfg.numeric === "object") {
    block.numericConfig = normalizeNumericConfig(cfg.numeric as NumericConfig);
  } else if (q && (q.unit != null || q.decimal_places != null || q.allow_decimals != null)) {
    block.numericConfig = normalizeNumericConfig({
      unit: q.unit,
      decimal_places: q.decimal_places,
      allow_decimals: q.allow_decimals ?? true,
    });
  }

  if (cfg.scanned_upload && typeof cfg.scanned_upload === "object") {
    const raw = cfg.scanned_upload as Record<string, unknown>;
    const defaults = defaultScannedUploadConfig();
    const subs = Array.isArray(raw.subquestions)
      ? (raw.subquestions as Array<Record<string, unknown>>).map((s, index) => ({
          id: String(s.id ?? newId()),
          question_label: String(s.question_label ?? ""),
          title: String(s.title ?? ""),
          description: String(s.description ?? ""),
          maximum_mark: Number(s.maximum_mark ?? 0),
          is_required: s.is_required !== false,
          include_in_total: s.include_in_total !== false,
          marking_guidance: String(s.marking_guidance ?? ""),
          display_order: Number(s.display_order ?? index),
        }))
      : [];
    block.scannedUploadConfig = {
      maximum_files: Number(raw.maximum_files ?? defaults.maximum_files),
      maximum_file_size_bytes: Number(
        raw.maximum_file_size_bytes ?? defaults.maximum_file_size_bytes,
      ),
      allowed_mime_types: Array.isArray(raw.allowed_mime_types)
        ? (raw.allowed_mime_types as string[])
        : defaults.allowed_mime_types,
      combine_images_to_pdf: raw.combine_images_to_pdf !== false,
      allow_images: raw.allow_images !== false,
      allow_pdf: raw.allow_pdf !== false,
      allow_docx: Boolean(raw.allow_docx),
      allow_replacement: raw.allow_replacement !== false,
      mark_scheme_storage_path:
        typeof raw.mark_scheme_storage_path === "string"
          ? raw.mark_scheme_storage_path
          : null,
      mark_scheme_file_name:
        typeof raw.mark_scheme_file_name === "string"
          ? raw.mark_scheme_file_name
          : null,
      subquestions: subs,
    };
  } else if (bt === "scanned_homework_upload") {
    block.scannedUploadConfig = defaultScannedUploadConfig();
  }

  if (q) {
    block.prompt = q.prompt;
    block.max_marks = q.max_marks;
    block.required = q.required;
    block.teacher_note = q.teacher_note ?? null;
    block.mark_scheme_note = q.mark_scheme_note ?? null;
    block.word_limit = q.word_limit ?? null;
    block.char_limit = q.char_limit ?? null;
    block.allow_attachments = q.allow_attachments ?? false;
    block.min_value = q.min_value != null ? Number(q.min_value) : null;
    block.max_value = q.max_value != null ? Number(q.max_value) : null;
    block.review_only = q.review_only ?? bt === "teacher_review";
    block.marks_apply = q.marks_apply ?? true;
    block.marking_mode =
      q.marking_mode === "automatic" ? "automatic" : "teacher_reviewed";
    block.shuffle_options = q.shuffle_options ?? false;
    block.suggested_minutes = q.suggested_minutes ?? null;
    block.table_marks_mode =
      (q.table_marks_mode as BuilderBlock["table_marks_mode"]) ?? "none";
    block.table_total_marks =
      q.table_total_marks != null ? Number(q.table_total_marks) : null;
    block.passage_block_ids = Array.isArray(q.passage_block_ids)
      ? (q.passage_block_ids as string[])
      : [];
    block.correct_option_indexes = Array.isArray(q.correct_option_indexes)
      ? (q.correct_option_indexes as number[])
      : [];
    block.option_feedback = Array.isArray(q.option_feedback)
      ? (q.option_feedback as string[])
      : [];

    if (q.correct_answer && typeof q.correct_answer === "object" && q.correct_answer !== null) {
      const ca = q.correct_answer as Record<string, unknown>;
      block.correct_answer = ca.value != null ? String(ca.value) : null;
      if (bt === "numeric") {
        block.numericConfig = normalizeNumericConfig({
          ...block.numericConfig,
          allow_decimals:
            typeof ca.allow_decimals === "boolean"
              ? ca.allow_decimals
              : block.numericConfig?.allow_decimals,
          decimal_places:
            ca.decimal_places != null
              ? Number(ca.decimal_places)
              : block.numericConfig?.decimal_places,
          unit:
            typeof ca.unit === "string" ? ca.unit : block.numericConfig?.unit,
          correct_min:
            ca.min != null ? Number(ca.min) : block.numericConfig?.correct_min,
          correct_max:
            ca.max != null ? Number(ca.max) : block.numericConfig?.correct_max,
        });
      }
    } else if (typeof q.correct_answer === "string") {
      block.correct_answer = q.correct_answer;
    } else {
      block.correct_answer = null;
    }

    if (bt === "numeric" && !block.numericConfig) {
      block.numericConfig = normalizeNumericConfig(null);
    }

    const rawChoices = q.choices;
    const indexesFromAnswer =
      q.correct_answer &&
      typeof q.correct_answer === "object" &&
      q.correct_answer !== null &&
      Array.isArray((q.correct_answer as Record<string, unknown>).indexes)
        ? ((q.correct_answer as Record<string, unknown>).indexes as number[])
        : [];
    const correctIndexes =
      (block.correct_option_indexes?.length
        ? block.correct_option_indexes
        : indexesFromAnswer) ?? [];

    if (Array.isArray(rawChoices)) {
      block.mcq_options = rawChoices.map((c, i) => {
        if (typeof c === "string") {
          return normalizeMcqOption(
            {
              id: `opt-${b.id}-${i}`,
              text: c,
              feedback: block.option_feedback?.[i] ?? "",
              correct: correctIndexes.includes(i),
            },
            i,
            `opt-${b.id}-${i}`,
          );
        }
        if (c && typeof c === "object") {
          const obj = c as Record<string, unknown>;
          const text =
            obj.text != null
              ? String(obj.text)
              : obj.label != null
                ? String(obj.label)
                : "";
          const fromFlag =
            typeof obj.is_correct === "boolean"
              ? obj.is_correct
              : typeof obj.correct === "boolean"
                ? obj.correct
                : correctIndexes.includes(i);
          return normalizeMcqOption(
            {
              id:
                typeof obj.id === "string" && obj.id
                  ? obj.id
                  : `opt-${b.id}-${i}`,
              text,
              feedback:
                typeof obj.feedback === "string"
                  ? obj.feedback
                  : (block.option_feedback?.[i] ?? ""),
              correct: fromFlag,
            },
            i,
            `opt-${b.id}-${i}`,
          );
        }
        return normalizeMcqOption(
          {
            id: `opt-${b.id}-${i}`,
            text: String(c),
            feedback: block.option_feedback?.[i] ?? "",
            correct: correctIndexes.includes(i),
          },
          i,
          `opt-${b.id}-${i}`,
        );
      });
    } else {
      block.mcq_options = [];
    }

    block.choices = block.mcq_options.map((o) => getMcqOptionText(o));
    block.option_feedback = block.mcq_options.map((o) => o.feedback ?? "");
    block.correct_option_indexes = block.mcq_options
      .map((o, i) => (o.correct ? i : -1))
      .filter((i) => i >= 0);
    if (
      (bt === "multiple_choice" || bt === "multiple_select") &&
      !block.correct_answer
    ) {
      const texts = block.mcq_options
        .filter((o) => o.correct)
        .map((o) => getMcqOptionText(o));
      block.correct_answer =
        bt === "multiple_choice" ? (texts[0] ?? null) : texts.join("\n") || null;
    }
  }

  if ((bt === "table" || bt === "vocabulary_table") && b.config) {
    block.tableConfig = {
      rows: typeof cfg.rows === "number" ? cfg.rows : 3,
      cols: typeof cfg.cols === "number" ? cfg.cols : 2,
      header_row: typeof cfg.header_row === "boolean" ? cfg.header_row : true,
      col_labels: Array.isArray(cfg.col_labels) ? (cfg.col_labels as string[]) : [],
    };
    block.cells = asEmbeddedArray(b.assignment_table_cells).map((c) => ({
      row_index: c.row_index,
      col_index: c.col_index,
      cell_type: c.cell_type as TableCellDef["cell_type"],
      label: c.label,
      marks: c.marks,
      read_only: c.read_only,
    }));
  }

  return block;
}

function buildTree(sections: DbSection[]): BuilderSection[] {
  const roots: DbSection[] = sections
    .filter((s) => !s.parent_section_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const children = new Map<string, DbSection[]>();
  for (const s of sections) {
    if (s.parent_section_id) {
      const arr = children.get(s.parent_section_id) ?? [];
      arr.push(s);
      children.set(s.parent_section_id, arr);
    }
  }

  function toBuilder(s: DbSection): BuilderSection {
    return {
      _id: s.id,
      title: s.title,
      blocks: s.blocks
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(dbBlockToBuilder),
      subsections: (children.get(s.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(toBuilder),
    };
  }

  return roots.map(toBuilder);
}

export async function loadTemplateStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  templateId: string,
): Promise<BuilderSection[]> {
  const fullSelect = `id, template_id, parent_section_id, title, sort_order,
       assignment_blocks (
         id, section_id, block_type, sort_order, content, config, teacher_only,
         assignment_questions (
           id, prompt, max_marks, required, response_type, choices, sort_order,
           teacher_note, mark_scheme_note, word_limit, char_limit, allow_attachments,
           min_value, max_value, correct_answer, comment_bank_key, review_only,
           marks_apply, marking_mode, shuffle_options, suggested_minutes,
           passage_block_ids, option_feedback, correct_option_indexes,
           table_marks_mode, table_total_marks
         ),
         assignment_table_cells (row_index, col_index, cell_type, label, marks, read_only)
       )`;
  const legacySelect = `id, template_id, parent_section_id, title, sort_order,
       assignment_blocks (
         id, section_id, block_type, sort_order, content, config, teacher_only,
         assignment_questions (
           id, prompt, max_marks, required, response_type, choices, sort_order,
           teacher_note, mark_scheme_note, word_limit, char_limit, allow_attachments,
           min_value, max_value, correct_answer, comment_bank_key, review_only
         ),
         assignment_table_cells (row_index, col_index, cell_type, label, marks, read_only)
       )`;

  let { data, error } = await supabase
    .from("assignment_sections")
    .select(fullSelect)
    .eq("template_id", templateId)
    .order("sort_order");

  if (error) {
    const fallback = await supabase
      .from("assignment_sections")
      .select(legacySelect)
      .eq("template_id", templateId)
      .order("sort_order");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  const rows: DbSection[] = (data ?? []).map((s) => ({
    id: s.id,
    template_id: s.template_id,
    parent_section_id: s.parent_section_id,
    title: s.title,
    sort_order: s.sort_order,
    blocks: (Array.isArray(s.assignment_blocks) ? s.assignment_blocks : []) as DbBlock[],
  }));

  const tree = buildTree(rows);
  return tree.length > 0 ? tree : [emptySection()];
}

/** Collect all response blocks in display order (skip teacher-only). */
export function flattenStudentBlocks(sections: BuilderSection[]): BuilderBlock[] {
  const out: BuilderBlock[] = [];
  function walk(section: BuilderSection) {
    for (const block of section.blocks) {
      if (block.teacher_only || block.block_type === "mark_scheme") continue;
      out.push(block);
    }
    for (const sub of section.subsections) walk(sub);
  }
  for (const s of sections) walk(s);
  return out;
}
