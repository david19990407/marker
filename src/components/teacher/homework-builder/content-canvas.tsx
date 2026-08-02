"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BLOCK_TYPE_LABELS,
  type AssignmentBlockType,
  type AssignmentCommentDraft,
  type BuilderBlock,
  type BuilderSection,
} from "@/lib/types";
import {
  cloneBlock,
  createBlock,
  emptySection,
  isResponseType,
} from "@/lib/homework/structure";
import { formatMarkLabel } from "@/lib/homework/marks";
import { collectPublishWarnings } from "@/lib/homework/publish-readiness";
import { StructuredWorksheetRenderer } from "@/components/shared/structured-worksheet-renderer";
import { BlockSettingsPanel } from "./block-settings-panel";
import type { CommentBankOption } from "./feedback-stage";

type CanvasMode = "edit" | "student" | "marking";

interface Props {
  sections: BuilderSection[];
  onChange: (updater: (prev: BuilderSection[]) => BuilderSection[]) => void;
  commentBanks?: CommentBankOption[];
  assignmentComments?: AssignmentCommentDraft[];
  onAssignmentCommentsChange?: (next: AssignmentCommentDraft[]) => void;
  assignmentId?: string;
  focusBlockId?: string | null;
  onFocusBlockConsumed?: () => void;
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
      "scanned_homework_upload",
      "table",
      "vocabulary_table",
    ],
  },
  {
    label: "Teacher-only",
    types: ["teacher_instruction", "teacher_review", "mark_scheme", "moderation_note", "staff_resource"],
  },
];

export function ContentCanvas({
  sections,
  onChange,
  commentBanks = [],
  assignmentComments = [],
  onAssignmentCommentsChange,
  assignmentId = "",
  focusBlockId = null,
  onFocusBlockConsumed,
}: Props) {
  const [mode, setMode] = useState<CanvasMode>("edit");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?._id ?? null,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [seenFocusBlockId, setSeenFocusBlockId] = useState<string | null>(null);

  // Apply publish-validation "Go to question" focus during render (not in an effect).
  if (focusBlockId && focusBlockId !== seenFocusBlockId) {
    setSeenFocusBlockId(focusBlockId);
    if (findBlock(sections, focusBlockId)) {
      setSelectedBlockId(focusBlockId);
      const sectionId = findSectionIdForBlock(sections, focusBlockId);
      if (sectionId) setSelectedSectionId(sectionId);
      setMode("edit");
    }
  }

  useEffect(() => {
    if (!focusBlockId) return;
    if (!findBlock(sections, focusBlockId)) return;
    const id = focusBlockId;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`builder-block-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusBlockConsumed?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusBlockId, sections, onFocusBlockConsumed]);

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

  function commit(updater: (prev: BuilderSection[]) => BuilderSection[]) {
    onChange(updater);
  }

  function addTopSection() {
    const section = emptySection();
    commit((prev) => [...prev, section]);
    setSelectedSectionId(section._id);
  }

  function addBlockToSelected(type: AssignmentBlockType) {
    const targetId = activeSectionId ?? sections[0]?._id;
    if (!targetId) {
      const section = emptySection();
      const block = createBlock(type);
      section.blocks = [block];
      commit(() => [section]);
      setSelectedSectionId(section._id);
      setSelectedBlockId(block._id);
      return;
    }
    const block = createBlock(type);
    commit((prev) =>
      updateSection(prev, targetId, (section) => ({
        ...section,
        blocks: [...section.blocks, block],
      })),
    );
    setSelectedSectionId(targetId);
    setSelectedBlockId(block._id);
  }

  function insertBlock(sectionId: string, index: number, type: AssignmentBlockType) {
    const block = createBlock(type);
    commit((prev) =>
      updateSection(prev, sectionId, (section) => {
        const blocks = [...section.blocks];
        blocks.splice(index, 0, block);
        return { ...section, blocks };
      }),
    );
    setSelectedSectionId(sectionId);
    setSelectedBlockId(block._id);
  }

  function updateBlock(
    blockId: string,
    updater: (prev: BuilderBlock) => BuilderBlock,
  ) {
    commit((prev) =>
      mapSections(prev, (section) => ({
        ...section,
        blocks: section.blocks.map((block) =>
          block._id === blockId ? updater(block) : block,
        ),
      })),
    );
  }

  function deleteBlock(sectionId: string, blockId: string) {
    if (!window.confirm("Delete this block?")) return;
    commit((prev) =>
      updateSection(prev, sectionId, (section) => ({
        ...section,
        blocks: section.blocks.filter((block) => block._id !== blockId),
      })),
    );
    if (activeBlockId === blockId) setSelectedBlockId(null);
  }

  function deleteSection(sectionId: string) {
    if (!window.confirm("Delete this section and everything inside it?")) return;
    commit((prev) => {
      const next = removeSection(prev, sectionId);
      if (activeBlockId && !findBlock(next, activeBlockId)) {
        setSelectedBlockId(null);
      }
      return next;
    });
    if (activeSectionId === sectionId) setSelectedSectionId(null);
  }

  function moveBlock(sectionId: string, index: number, direction: -1 | 1) {
    commit((prev) =>
      updateSection(prev, sectionId, (section) => {
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
    commit((prev) =>
      updateSection(prev, sectionId, (section) => {
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

          {(() => {
            const warnings = collectPublishWarnings(sections);
            return warnings.length > 0 ? (
              <Card className="border-amber-200 bg-amber-50/60">
                <CardTitle className="mb-2 text-amber-950">
                  Before publishing
                </CardTitle>
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
                  {warnings.slice(0, 8).map((w) => (
                    <li key={`${w.blockId}-${w.message}`}>{w.message}</li>
                  ))}
                  {warnings.length > 8 ? (
                    <li>…and {warnings.length - 8} more incomplete blocks</li>
                  ) : null}
                </ul>
              </Card>
            ) : null;
          })()}

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
                commit((prev) =>
                  updateSection(prev, sectionId, (s) => ({ ...s, title })),
                )
              }
              onAddSubsection={(sectionId) => {
                const sub = emptySection();
                sub.title = "New subsection";
                commit((prev) =>
                  updateSection(prev, sectionId, (s) => ({
                    ...s,
                    subsections: [...s.subsections, sub],
                  })),
                );
                setSelectedSectionId(sub._id);
              }}
              onDeleteSection={deleteSection}
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
          assignmentComments={assignmentComments}
          onAssignmentCommentsChange={onAssignmentCommentsChange}
          assignmentId={assignmentId}
          onChange={(updater) => {
            if (!selectedBlock) return;
            updateBlock(selectedBlock._id, updater);
          }}
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
  onDeleteSection,
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
  onDeleteSection: (id: string) => void;
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
        <details
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <summary className="cursor-pointer list-none rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Actions
          </summary>
          <div className="absolute right-0 z-10 mt-1 min-w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              onClick={() => onDeleteSection(section._id)}
            >
              Delete
            </button>
          </div>
        </details>
      </div>

      {!isCollapsed ? (
        <div className="space-y-2">
          <InlineAddBlock
            onAdd={(type) => onInsertBlock(section._id, 0, type)}
            label="Add block at start"
          />
          {section.blocks.map((block, index) => (
            <div key={block._id} id={`builder-block-${block._id}`} className="space-y-2">
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
              onDeleteSection={onDeleteSection}
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
          <Badge tone="brand">{formatMarkLabel(block.max_marks)}</Badge>
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
    <Card className="space-y-4">
      <div>
        <CardTitle>Student preview</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Same renderer students use. Empty draft placeholders are hidden.
        </p>
      </div>
      <StructuredWorksheetRenderer sections={sections} mode="teacher_preview" />
    </Card>
  );
}

function TeacherMarkingPreview({ sections }: { sections: BuilderSection[] }) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Teacher marking preview</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Worksheet with teacher guidance panels. Answers appear empty until a
          submission is opened.
        </p>
      </div>
      <StructuredWorksheetRenderer
        sections={sections}
        mode="teacher_marking"
        showTeacherGuidance
      />
    </Card>
  );
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

function findSectionIdForBlock(
  sections: BuilderSection[],
  blockId: string,
): string | null {
  for (const section of sections) {
    if (section.blocks.some((block) => block._id === blockId)) return section._id;
    const nested = findSectionIdForBlock(section.subsections, blockId);
    if (nested) return nested;
  }
  return null;
}

function removeSection(
  sections: BuilderSection[],
  sectionId: string,
): BuilderSection[] {
  return sections
    .filter((section) => section._id !== sectionId)
    .map((section) => ({
      ...section,
      subsections: removeSection(section.subsections, sectionId),
    }));
}
