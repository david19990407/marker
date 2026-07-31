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

export function createBlock(type: AssignmentBlockType): BuilderBlock {
  const isTeacherOnly = type === "mark_scheme" || type === "teacher_review";
  const base: BuilderBlock = {
    _id: newId(),
    block_type: type,
    content: "",
    teacher_only: isTeacherOnly,
  };

  if (isResponseType(type)) {
    base.prompt = "";
    base.max_marks = null;
    base.required = false;
    base.choices = type === "multiple_choice" ? ["Option A", "Option B"] : [];
  }

  if (type === "table" || type === "vocabulary_table") {
    const rows = type === "vocabulary_table" ? 4 : 3;
    const cols = type === "vocabulary_table" ? 2 : 3;
    base.tableConfig = defaultTableConfig(rows, cols);
    base.cells = defaultTableCells(rows, cols);
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

// ── Payload serialisation ────────────────────────────────────────────────────

type BlockPayload = {
  block_type: AssignmentBlockType;
  content: string;
  teacher_only: boolean;
  prompt?: string;
  max_marks?: number | null;
  required?: boolean;
  choices?: unknown[];
  response_type?: string;
  cells?: TableCellDef[];
  config?: Record<string, unknown>;
};

type SectionPayload = {
  title: string;
  blocks: BlockPayload[];
  subsections: SectionPayload[];
};

function blockToPayload(b: BuilderBlock): BlockPayload {
  const payload: BlockPayload = {
    block_type: b.block_type,
    content: b.content,
    teacher_only: b.teacher_only,
  };

  if (isResponseType(b.block_type)) {
    payload.prompt = b.prompt ?? "";
    payload.max_marks = b.max_marks ?? null;
    payload.required = b.required ?? false;
    payload.choices = b.choices?.map((c) => ({ label: c })) ?? [];
    payload.response_type = b.block_type;
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
    block_type: bt,
    content: b.content,
    teacher_only: b.teacher_only,
  };

  if (q) {
    block.prompt = q.prompt;
    block.max_marks = q.max_marks;
    block.required = q.required;
    const rawChoices = q.choices;
    if (Array.isArray(rawChoices)) {
      block.choices = rawChoices.map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "label" in c) return String((c as Record<string, unknown>).label);
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
         assignment_questions (id, prompt, max_marks, required, response_type, choices, sort_order),
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
