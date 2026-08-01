"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOCK_TYPE_LABELS,
  type AssignmentBlockType,
  type BuilderBlock,
  type BuilderSection,
} from "@/lib/types";
import {
  cloneBlock,
  createBlock,
  emptySection,
  isResponseType,
} from "@/lib/homework/structure";
import { formatMarks } from "@/lib/homework/marks";
import { BlockSettingsPanel } from "./block-settings-panel";

type CanvasMode = "edit" | "student" | "marking";
type CommentBankOption = { id: string; name: string };

interface Props {
  sections: BuilderSection[];
  onChange: (sections: BuilderSection[]) => void;
  commentBanks?: CommentBankOption[];
}

const LIBRARY_GROUPS: Array<{ label: string; types: AssignmentBlockType[] }> = [
  {
    label: "Content",
    types: [
      "heading",
      "subheading",
      "instruction",
      "rich_text",
      "passage",
      "image",
      "embedded_video",
      "downloadable_resource",
      "divider",
      "page_break",
    ],
  },
  {
    label: "Questions",
    types: [
      "numbered_question",
      "short_text",
      "extended_writing",
      "numeric",
      "multiple_choice",
      "multiple_select",
      "tick_box",
      "file_upload",
      "table",
      "vocabulary_table",
    ],
  },
  {
    label: "Teacher-only",
    types: ["teacher_instruction", "teacher_review", "mark_scheme", "moderation_note", "staff_resource"],
  },
];

export function ContentCanvas({ sections, onChange, commentBanks = [] }: Props) {
  const [mode, setMode] = useState<CanvasMode>("edit");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?._id ?? null,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeSectionId =
    selectedSectionId && findSection(sections, selectedSectionId)
      ? selectedSectionId
      : (sections[0]?._id ?? null);
  const activeBlockId =
    selectedBlockId && findBlock(sections, selectedBlockId)
      ? selectedBlockId
      : null;

  const selectedBlock = useMemo(
    () => (activeBlockId ? findBlock(sections, activeBlockId) : null),
    [sections, activeBlockId],
  );

  function commit(next: BuilderSection[]) {
    onChange(next);
  }

  function addTopSection() {
    const section = emptySection();
    commit([...sections, section]);
    setSelectedSectionId(section._id);
  }

  function addBlockToSelected(type: AssignmentBlockType) {
    const targetId = activeSectionId ?? sections[0]?._id;
    if (!targetId) {
      const section = emptySection();
      const block = createBlock(type);
      section.blocks = [block];
      commit([section]);
      setSelectedSectionId(section._id);
      setSelectedBlockId(block._id);
      return;
    }
    const block = createBlock(type);
    commit(
      updateSection(sections, targetId, (section) => ({
        ...section,
        blocks: [...section.blocks, block],
      })),
    );
    setSelectedSectionId(targetId);
    setSelectedBlockId(block._id);
  }

  function insertBlock(sectionId: string, index: number, type: AssignmentBlockType) {
    const block = createBlock(type);
    commit(
      updateSection(sections, sectionId, (section) => {
        const blocks = [...section.blocks];
        blocks.splice(index, 0, block);
        return { ...section, blocks };
      }),
    );
    setSelectedSectionId(sectionId);
    setSelectedBlockId(block._id);
  }

  function updateBlock(blockId: string, nextBlock: BuilderBlock) {
    commit(
      mapSections(sections, (section) => ({
        ...section,
        blocks: section.blocks.map((block) => (block._id === blockId ? nextBlock : block)),
      })),
    );
  }

  function deleteBlock(sectionId: string, blockId: string) {
    if (!window.confirm("Delete this block?")) return;
    commit(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        blocks: section.blocks.filter((block) => block._id !== blockId),
      })),
    );
    if (activeBlockId === blockId) setSelectedBlockId(null);
  }

  function moveBlock(sectionId: string, index: number, direction: -1 | 1) {
    commit(
      updateSection(sections, sectionId, (section) => {
        const target = index + direction;
        if (target < 0 || target >= section.blocks.length) return section;
        const blocks = [...section.blocks];
        [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
        return { ...section, blocks };
      }),
    );
  }

  function duplicateBlock(sectionId: string, block: BuilderBlock, index: number) {
    const copy = cloneBlock(block);
    commit(
      updateSection(sections, sectionId, (section) => {
        const blocks = [...section.blocks];
        blocks.splice(index + 1, 0, copy);
        return { ...section, blocks };
      }),
    );
    setSelectedBlockId(copy._id);
  }

  if (mode === "student") {
    return (
      <div className="space-y-4">
        <ModeToggle mode={mode} onChange={setMode} />
        <StudentPreview sections={sections} />
      </div>
    );
  }

  if (mode === "marking") {
    return (
      <div className="space-y-4">
        <ModeToggle mode={mode} onChange={setMode} />
        <TeacherMarkingPreview sections={sections} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModeToggle mode={mode} onChange={setMode} />
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
        <BlockLibrary onAdd={addBlockToSelected} />

        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Worksheet canvas</CardTitle>
              <p className="text-sm text-slate-500">
                Build the student worksheet. Select a block to edit its settings.
              </p>
            </div>
            <Button variant="secondary" onClick={addTopSection}>
              + Add section
            </Button>
          </Card>

          {sections.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">
                No sections yet. Add a section or choose a block from the library to start.
              </p>
            </Card>
          ) : null}

          {sections.map((section) => (
            <SectionCanvas
              key={section._id}
              section={section}
              depth={0}
              selectedSectionId={activeSectionId}
              selectedBlockId={activeBlockId}
              collapsed={collapsed}
              onSelectSection={setSelectedSectionId}
              onSelectBlock={setSelectedBlockId}
              onToggleCollapse={(sectionId) =>
                setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
              }
              onRenameSection={(sectionId, title) =>
                commit(updateSection(sections, sectionId, (s) => ({ ...s, title })))
              }
              onAddSubsection={(sectionId) => {
                const sub = emptySection();
                sub.title = "New subsection";
                commit(
                  updateSection(sections, sectionId, (s) => ({
                    ...s,
                    subsections: [...s.subsections, sub],
                  })),
                );
                setSelectedSectionId(sub._id);
              }}
              onInsertBlock={insertBlock}
              onDeleteBlock={deleteBlock}
              onMoveBlock={moveBlock}
              onDuplicateBlock={duplicateBlock}
            />
          ))}
        </div>

        <BlockSettingsPanel
          block={selectedBlock}
          allSections={sections}
          commentBanks={commentBanks}
          onChange={(block) => updateBlock(block._id, block)}
        />
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CanvasMode;
  onChange: (mode: CanvasMode) => void;
}) {
  const modes: Array<{ value: CanvasMode; label: string }> = [
    { value: "edit", label: "Edit" },
    { value: "student", label: "Student preview" },
    { value: "marking", label: "Teacher marking preview" },
  ];
  return (
    <Card className="flex flex-wrap gap-2">
      {modes.map((item) => (
        <Button
          key={item.value}
          type="button"
          variant={mode === item.value ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </Card>
  );
}

function BlockLibrary({ onAdd }: { onAdd: (type: AssignmentBlockType) => void }) {
  return (
    <Card className="h-fit space-y-4">
      <div>
        <CardTitle>Block library</CardTitle>
        <p className="mt-1 text-xs text-slate-500">
          Click a block to add it to the selected section.
        </p>
      </div>
      {LIBRARY_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.types.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onAdd(type)}
                className="w-full rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
              >
                {BLOCK_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

function SectionCanvas({
  section,
  depth,
  selectedSectionId,
  selectedBlockId,
  collapsed,
  onSelectSection,
  onSelectBlock,
  onToggleCollapse,
  onRenameSection,
  onAddSubsection,
  onInsertBlock,
  onDeleteBlock,
  onMoveBlock,
  onDuplicateBlock,
}: {
  section: BuilderSection;
  depth: number;
  selectedSectionId: string | null;
  selectedBlockId: string | null;
  collapsed: Record<string, boolean>;
  onSelectSection: (id: string) => void;
  onSelectBlock: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onRenameSection: (id: string, title: string) => void;
  onAddSubsection: (id: string) => void;
  onInsertBlock: (sectionId: string, index: number, type: AssignmentBlockType) => void;
  onDeleteBlock: (sectionId: string, blockId: string) => void;
  onMoveBlock: (sectionId: string, index: number, direction: -1 | 1) => void;
  onDuplicateBlock: (sectionId: string, block: BuilderBlock, index: number) => void;
}) {
  const isSelected = selectedSectionId === section._id;
  const isCollapsed = collapsed[section._id] ?? false;

  return (
    <Card
      className={`space-y-3 ${depth > 0 ? "ml-4 border-slate-200" : ""} ${
        isSelected ? "ring-2 ring-brand-200" : ""
      }`}
      onClick={() => onSelectSection(section._id)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(section._id);
          }}
          aria-label={isCollapsed ? "Expand section" : "Collapse section"}
        >
          {isCollapsed ? "Show" : "Hide"}
        </Button>
        <Input
          value={section.title}
          onChange={(e) => onRenameSection(section._id, e.target.value)}
          className="min-w-48 flex-1 font-semibold"
          aria-label="Section title"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAddSubsection(section._id);
          }}
        >
          + Add subsection
        </Button>
      </div>

      {!isCollapsed ? (
        <div className="space-y-2">
          <InlineAddBlock
            onAdd={(type) => onInsertBlock(section._id, 0, type)}
            label="Add block at start"
          />
          {section.blocks.map((block, index) => (
            <div key={block._id} className="space-y-2">
              <BlockRow
                block={block}
                index={index}
                total={section.blocks.length}
                selected={selectedBlockId === block._id}
                onSelect={() => onSelectBlock(block._id)}
                onMoveUp={() => onMoveBlock(section._id, index, -1)}
                onMoveDown={() => onMoveBlock(section._id, index, 1)}
                onDuplicate={() => onDuplicateBlock(section._id, block, index)}
                onDelete={() => onDeleteBlock(section._id, block._id)}
              />
              <InlineAddBlock
                onAdd={(type) => onInsertBlock(section._id, index + 1, type)}
                label="Add block here"
              />
            </div>
          ))}

          {section.subsections.map((sub) => (
            <SectionCanvas
              key={sub._id}
              section={sub}
              depth={depth + 1}
              selectedSectionId={selectedSectionId}
              selectedBlockId={selectedBlockId}
              collapsed={collapsed}
              onSelectSection={onSelectSection}
              onSelectBlock={onSelectBlock}
              onToggleCollapse={onToggleCollapse}
              onRenameSection={onRenameSection}
              onAddSubsection={onAddSubsection}
              onInsertBlock={onInsertBlock}
              onDeleteBlock={onDeleteBlock}
              onMoveBlock={onMoveBlock}
              onDuplicateBlock={onDuplicateBlock}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function InlineAddBlock({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (type: AssignmentBlockType) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="w-full rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
      >
        + {label}
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl border border-dashed border-brand-200 bg-brand-50 p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {(["instruction", "short_text", "extended_writing", "multiple_choice", "table"] as AssignmentBlockType[]).map(
          (type) => (
            <Button
              key={type}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
            >
              {BLOCK_TYPE_LABELS[type]}
            </Button>
          ),
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  index,
  total,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  block: BuilderBlock;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const response = isResponseType(block.block_type);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`rounded-2xl border p-3 transition ${
        selected
          ? "border-brand-300 bg-brand-50"
          : block.teacher_only
            ? "border-amber-200 bg-amber-50"
            : "border-slate-100 bg-white hover:border-brand-100"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">#{index + 1}</span>
        <span className="font-medium text-slate-800">
          {block.content || block.prompt || BLOCK_TYPE_LABELS[block.block_type]}
        </span>
        <Badge tone={block.teacher_only ? "warning" : "neutral"}>
          {BLOCK_TYPE_LABELS[block.block_type]}
        </Badge>
        {response && block.max_marks != null ? (
          <Badge tone="brand">{formatMarks(block.max_marks)} marks</Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={onMoveUp}>
            Up
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            Down
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      {block.prompt ? (
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-slate-500">
          {block.prompt}
        </p>
      ) : null}
    </div>
  );
}

export function StudentPreview({ sections }: { sections: BuilderSection[] }) {
  return (
    <Card className="space-y-6">
      <div>
        <CardTitle>Student preview</CardTitle>
        <p className="mt-1 text-sm text-slate-500">Teacher-only blocks are hidden.</p>
      </div>
      {sections.map((section) => (
        <PreviewSection key={section._id} section={section} mode="student" />
      ))}
    </Card>
  );
}

function TeacherMarkingPreview({ sections }: { sections: BuilderSection[] }) {
  return (
    <Card className="space-y-6">
      <div>
        <CardTitle>Teacher marking preview</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Student content plus teacher guidance and mark-scheme notes.
        </p>
      </div>
      {sections.map((section) => (
        <PreviewSection key={section._id} section={section} mode="marking" />
      ))}
    </Card>
  );
}

function PreviewSection({
  section,
  mode,
}: {
  section: BuilderSection;
  mode: "student" | "marking";
}) {
  const blocks =
    mode === "student"
      ? section.blocks.filter((block) => !block.teacher_only && block.block_type !== "mark_scheme")
      : section.blocks;

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
      {blocks.map((block) => (
        <PreviewBlock key={block._id} block={block} mode={mode} />
      ))}
      {section.subsections.map((sub) => (
        <div key={sub._id} className="ml-4 border-l-2 border-slate-100 pl-4">
          <PreviewSection section={sub} mode={mode} />
        </div>
      ))}
    </section>
  );
}

function PreviewBlock({
  block,
  mode,
}: {
  block: BuilderBlock;
  mode: "student" | "marking";
}) {
  if (mode === "student" && (block.teacher_only || block.block_type === "mark_scheme")) {
    return null;
  }

  const guidance =
    mode === "marking" && (block.teacher_note || block.mark_scheme_note || block.teacher_only);

  switch (block.block_type) {
    case "heading":
      return <h2 className="text-2xl font-bold text-slate-900">{block.content}</h2>;
    case "subheading":
      return <h3 className="text-lg font-semibold text-slate-800">{block.content}</h3>;
    case "instruction":
    case "rich_text":
    case "teacher_instruction":
    case "moderation_note":
    case "staff_resource":
    case "mark_scheme":
      return (
        <div className={block.teacher_only ? "rounded-2xl bg-amber-50 p-3" : ""}>
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {block.content || block.prompt}
          </p>
        </div>
      );
    case "passage":
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          {block.passageConfig?.title ? (
            <p className="mb-2 font-semibold text-slate-800">{block.passageConfig.title}</p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{block.content}</p>
        </div>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "page_break":
      return <div className="border-t border-dashed border-slate-300 text-xs text-slate-400" />;
    case "embedded_video":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-brand-700">
          Video: {block.external_url || block.content || "Embedded video"}
        </div>
      );
    case "downloadable_resource":
    case "image":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {BLOCK_TYPE_LABELS[block.block_type]}: {block.content || block.external_url || "Resource"}
        </div>
      );
    default:
      return (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-800">{block.content || block.prompt || "Question"}</p>
            {isResponseType(block.block_type) && block.max_marks != null ? (
              <Badge tone="brand">{formatMarks(block.max_marks)} marks</Badge>
            ) : null}
            {block.required ? <Badge tone="warning">Required</Badge> : null}
          </div>
          {block.content && block.prompt ? (
            <p className="whitespace-pre-wrap text-sm text-slate-500">{block.prompt}</p>
          ) : null}
          <PreviewAnswerField block={block} />
          {guidance ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
              {block.teacher_note ? <p>Teacher-only notes: {block.teacher_note}</p> : null}
              {block.mark_scheme_note ? <p>Marking guidance: {block.mark_scheme_note}</p> : null}
            </div>
          ) : null}
        </div>
      );
  }
}

function PreviewAnswerField({ block }: { block: BuilderBlock }) {
  if (block.review_only) return <p className="text-sm text-slate-400">Teacher review item</p>;
  if (block.block_type === "short_text") return <Input disabled placeholder="Short answer..." />;
  if (block.block_type === "numeric") return <Input disabled className="w-40" placeholder="Number" />;
  if (block.block_type === "multiple_choice" || block.block_type === "multiple_select") {
    const multi = block.block_type === "multiple_select";
    return (
      <div className="space-y-1">
        {(block.choices ?? []).map((choice, index) => (
          <label key={`${choice}-${index}`} className="flex items-center gap-2 text-sm">
            <input type={multi ? "checkbox" : "radio"} disabled />
            {choice}
          </label>
        ))}
      </div>
    );
  }
  if (block.block_type === "tick_box") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled />
        Tick box
      </label>
    );
  }
  if (block.block_type === "file_upload") return <Input disabled type="file" />;
  if (block.block_type === "table" || block.block_type === "vocabulary_table") {
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-100">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              {(block.tableConfig?.col_labels ?? []).map((label, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs text-slate-500">
                  {label || `Column ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(1, (block.tableConfig?.rows ?? 2) - 1) }).map(
              (_, row) => (
                <tr key={row} className="border-t border-slate-100">
                  {Array.from({ length: block.tableConfig?.cols ?? 1 }).map((__, col) => (
                    <td key={col} className="px-3 py-2 text-slate-300">
                      -
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.block_type === "extended_writing" || block.block_type === "numbered_question") {
    return <Textarea disabled placeholder="Student writes here..." className="min-h-28" />;
  }
  return null;
}

function mapSections(
  sections: BuilderSection[],
  mapper: (section: BuilderSection) => BuilderSection,
): BuilderSection[] {
  return sections.map((section) =>
    mapper({ ...section, subsections: mapSections(section.subsections, mapper) }),
  );
}

function updateSection(
  sections: BuilderSection[],
  sectionId: string,
  updater: (section: BuilderSection) => BuilderSection,
): BuilderSection[] {
  return sections.map((section) => {
    if (section._id === sectionId) return updater(section);
    return { ...section, subsections: updateSection(section.subsections, sectionId, updater) };
  });
}

function findSection(sections: BuilderSection[], sectionId: string): BuilderSection | null {
  for (const section of sections) {
    if (section._id === sectionId) return section;
    const found = findSection(section.subsections, sectionId);
    if (found) return found;
  }
  return null;
}

function findBlock(sections: BuilderSection[], blockId: string): BuilderBlock | null {
  for (const section of sections) {
    const found = section.blocks.find((block) => block._id === blockId);
    if (found) return found;
    const nested = findBlock(section.subsections, blockId);
    if (nested) return nested;
  }
  return null;
}
