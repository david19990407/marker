import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentBlockType,
  BuilderBlock,
  BuilderSection,
  TableCellDef,
  TableConfig,
} from "@/lib/types";
import { RESPONSE_BLOCK_TYPES as RESPONSE_TYPES } from "@/lib/types";

// ── Identity helpers ─────────────────────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID();
}

/** Duplicate a block as new content (clears persisted question id). */
export function cloneBlock(block: BuilderBlock): BuilderBlock {
  return {
    ...block,
    _id: newId(),
    question_id: null,
    cells: block.cells?.map((c) => ({ ...c })),
    choices: block.choices ? [...block.choices] : undefined,
    tableConfig: block.tableConfig ? { ...block.tableConfig, col_labels: [...block.tableConfig.col_labels] } : undefined,
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
    question_id: null,
    block_type: "vocabulary_table",
    content: "Vocabulary",
    teacher_only: false,
    prompt: "Complete the vocabulary table",
    max_marks: null,
    required: false,
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

  const isTeacherOnly = type === "mark_scheme" || type === "teacher_review";
  const base: BuilderBlock = {
    _id: newId(),
    question_id: null,
    block_type: type,
    content: "",
    teacher_only: isTeacherOnly,
    student_visible: !isTeacherOnly,
    review_only: type === "teacher_review",
    allow_attachments: type === "file_upload",
  };

  if (isResponseType(type)) {
    base.prompt = "";
    base.max_marks = null;
    base.required = false;
    base.choices = type === "multiple_choice" ? ["Option A", "Option B"] : [];
    base.teacher_note = null;
    base.mark_scheme_note = null;
    base.word_limit = null;
    base.char_limit = null;
    base.min_value = null;
    base.max_value = null;
    base.correct_answer = null;
    base.comment_bank_key = null;
  }

  if (type === "table") {
    const rows = 3;
    const cols = 3;
    base.tableConfig = defaultTableConfig(rows, cols);
    base.cells = defaultTableCells(rows, cols);
    base.prompt = "";
    base.max_marks = null;
    base.required = false;
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

// ── Predicate helpers ────────────────────────────────────────────────────────

export function isResponseType(t: AssignmentBlockType): boolean {
  return (RESPONSE_TYPES as readonly AssignmentBlockType[]).includes(t);
}

export function isTeacherOnlyType(t: AssignmentBlockType): boolean {
  return t === "mark_scheme" || t === "teacher_review";
}

export function responseKey(block: BuilderBlock): string {
  return block.question_id || block._id;
}

// ── Payload serialisation ────────────────────────────────────────────────────

type BlockPayload = {
  id: string;
  question_id?: string | null;
  block_type: AssignmentBlockType;
  content: string;
  teacher_only: boolean;
  prompt?: string;
  max_marks?: number | null;
  required?: boolean;
  choices?: unknown[];
  response_type?: string;
  teacher_note?: string | null;
  mark_scheme_note?: string | null;
  word_limit?: number | null;
  char_limit?: number | null;
  allow_attachments?: boolean;
  min_value?: number | null;
  max_value?: number | null;
  correct_answer?: unknown;
  comment_bank_key?: string | null;
  review_only?: boolean;
  cells?: TableCellDef[];
  config?: Record<string, unknown>;
};

type SectionPayload = {
  id: string;
  title: string;
  blocks: BlockPayload[];
  subsections: SectionPayload[];
};

function blockToPayload(b: BuilderBlock): BlockPayload {
  const payload: BlockPayload = {
    id: b._id,
    block_type: b.block_type,
    content: b.content,
    teacher_only: b.teacher_only || b.student_visible === false,
  };

  if (isResponseType(b.block_type)) {
    payload.question_id = b.question_id ?? null;
    payload.prompt = b.prompt ?? "";
    payload.max_marks = b.max_marks ?? null;
    payload.required = b.required ?? false;
    payload.choices = b.choices?.map((c) => ({ label: c })) ?? [];
    payload.response_type = b.block_type;
    payload.teacher_note = b.teacher_note ?? null;
    payload.mark_scheme_note = b.mark_scheme_note ?? null;
    payload.word_limit = b.word_limit ?? null;
    payload.char_limit = b.char_limit ?? null;
    payload.allow_attachments = b.allow_attachments ?? false;
    payload.min_value = b.min_value ?? null;
    payload.max_value = b.max_value ?? null;
    payload.correct_answer = b.correct_answer
      ? { value: b.correct_answer }
      : null;
    payload.comment_bank_key = b.comment_bank_key ?? null;
    payload.review_only = b.review_only ?? b.block_type === "teacher_review";
  }

  if (
    (b.block_type === "table" || b.block_type === "vocabulary_table") &&
    b.tableConfig
  ) {
    payload.config = { ...(b.tableConfig as unknown as Record<string, unknown>) };
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

type DbBlock = {
  id: string;
  section_id: string;
  block_type: string;
  sort_order: number;
  content: string;
  config: Record<string, unknown> | null;
  teacher_only: boolean;
  assignment_questions: Array<{
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
  }> | null;
  assignment_table_cells: Array<{
    row_index: number;
    col_index: number;
    cell_type: string;
    label: string | null;
    marks: number | null;
    read_only: boolean;
  }> | null;
};

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
  const q = b.assignment_questions?.[0] ?? null;
  const block: BuilderBlock = {
    _id: b.id,
    question_id: q?.id ?? null,
    block_type: bt,
    content: b.content,
    teacher_only: b.teacher_only,
    student_visible: !b.teacher_only,
  };

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
    block.comment_bank_key = q.comment_bank_key ?? null;
    if (q.correct_answer && typeof q.correct_answer === "object" && q.correct_answer !== null) {
      const ca = q.correct_answer as Record<string, unknown>;
      block.correct_answer = ca.value != null ? String(ca.value) : null;
    } else if (typeof q.correct_answer === "string") {
      block.correct_answer = q.correct_answer;
    } else {
      block.correct_answer = null;
    }
    const rawChoices = q.choices;
    if (Array.isArray(rawChoices)) {
      block.choices = rawChoices.map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "label" in c) {
          return String((c as Record<string, unknown>).label);
        }
        return String(c);
      });
    } else {
      block.choices = [];
    }
  }

  if ((bt === "table" || bt === "vocabulary_table") && b.config) {
    const cfg = b.config;
    block.tableConfig = {
      rows: typeof cfg.rows === "number" ? cfg.rows : 3,
      cols: typeof cfg.cols === "number" ? cfg.cols : 2,
      header_row: typeof cfg.header_row === "boolean" ? cfg.header_row : true,
      col_labels: Array.isArray(cfg.col_labels) ? (cfg.col_labels as string[]) : [],
    };
    block.cells = (b.assignment_table_cells ?? []).map((c) => ({
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
  const { data, error } = await supabase
    .from("assignment_sections")
    .select(
      `id, template_id, parent_section_id, title, sort_order,
       assignment_blocks (
         id, section_id, block_type, sort_order, content, config, teacher_only,
         assignment_questions (
           id, prompt, max_marks, required, response_type, choices, sort_order,
           teacher_note, mark_scheme_note, word_limit, char_limit, allow_attachments,
           min_value, max_value, correct_answer, comment_bank_key, review_only
         ),
         assignment_table_cells (row_index, col_index, cell_type, label, marks, read_only)
       )`,
    )
    .eq("template_id", templateId)
    .order("sort_order");

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
