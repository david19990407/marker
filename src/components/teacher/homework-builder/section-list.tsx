"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockEditor } from "./block-editor";
import { BlockPalette } from "./block-palette";
import { emptySection, createBlock, newId } from "@/lib/homework/structure";
import type { BuilderSection, BuilderBlock, AssignmentBlockType } from "@/lib/types";

interface SectionListProps {
  sections: BuilderSection[];
  onChange: (sections: BuilderSection[]) => void;
  previewMode: boolean;
  depth?: number;
}

export function SectionList({
  sections,
  onChange,
  previewMode,
  depth = 0,
}: SectionListProps) {
  function updateSection(index: number, updated: BuilderSection) {
    const next = [...sections];
    next[index] = updated;
    onChange(next);
  }

  function deleteSection(index: number) {
    onChange(sections.filter((_, i) => i !== index));
  }

  function moveSection(index: number, dir: -1 | 1) {
    const next = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function duplicateSection(index: number) {
    const copy: BuilderSection = {
      ...sections[index],
      _id: newId(),
      title: `${sections[index].title} (copy)`,
      blocks: sections[index].blocks.map((b) => ({ ...b, _id: newId() })),
      subsections: sections[index].subsections.map((s) => ({
        ...s,
        _id: newId(),
        blocks: s.blocks.map((b) => ({ ...b, _id: newId() })),
        subsections: [],
      })),
    };
    const next = [...sections];
    next.splice(index + 1, 0, copy);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <SectionItem
          key={section._id}
          section={section}
          index={si}
          total={sections.length}
          depth={depth}
          previewMode={previewMode}
          onUpdate={(updated) => updateSection(si, updated)}
          onDelete={() => deleteSection(si)}
          onMoveUp={() => moveSection(si, -1)}
          onMoveDown={() => moveSection(si, 1)}
          onDuplicate={() => duplicateSection(si)}
        />
      ))}
    </div>
  );
}

interface SectionItemProps {
  section: BuilderSection;
  index: number;
  total: number;
  depth: number;
  previewMode: boolean;
  onUpdate: (s: BuilderSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
}

function SectionItem({
  section,
  index,
  total,
  depth,
  previewMode,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: SectionItemProps) {
  function setTitle(title: string) {
    onUpdate({ ...section, title });
  }

  function addBlock(type: AssignmentBlockType) {
    onUpdate({
      ...section,
      blocks: [...section.blocks, createBlock(type)],
    });
  }

  function updateBlock(idx: number, block: BuilderBlock) {
    const next = [...section.blocks];
    next[idx] = block;
    onUpdate({ ...section, blocks: next });
  }

  function deleteBlock(idx: number) {
    onUpdate({
      ...section,
      blocks: section.blocks.filter((_, i) => i !== idx),
    });
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const next = [...section.blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onUpdate({ ...section, blocks: next });
  }

  function duplicateBlock(idx: number) {
    const copy: BuilderBlock = { ...section.blocks[idx], _id: newId() };
    const next = [...section.blocks];
    next.splice(idx + 1, 0, copy);
    onUpdate({ ...section, blocks: next });
  }

  function addSubsection() {
    onUpdate({
      ...section,
      subsections: [...section.subsections, emptySection()],
    });
  }

  const bgClass = depth === 0 ? "" : "bg-slate-50";

  return (
    <Card className={bgClass}>
      {/* Section header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          {previewMode ? (
            <h3 className={`font-semibold ${depth === 0 ? "text-lg" : "text-base"} text-slate-800`}>
              {section.title}
            </h3>
          ) : (
            <Input
              value={section.title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-semibold"
              placeholder="Section title"
              aria-label="Section title"
            />
          )}
        </div>
        {!previewMode && (
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move section up"
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move section down"
            >
              ↓
            </Button>
            <Button size="sm" variant="ghost" onClick={onDuplicate}>
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm("Delete this section and all its blocks?")) onDelete();
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {section.blocks.map((block, bi) => {
          if (previewMode && (block.teacher_only || block.block_type === "mark_scheme")) {
            return null;
          }
          return (
            <BlockEditor
              key={block._id}
              block={block}
              index={bi}
              total={section.blocks.length}
              previewMode={previewMode}
              onChange={(updated) => updateBlock(bi, updated)}
              onDelete={() => deleteBlock(bi)}
              onMoveUp={() => moveBlock(bi, -1)}
              onMoveDown={() => moveBlock(bi, 1)}
              onDuplicate={() => duplicateBlock(bi)}
            />
          );
        })}
      </div>

      {/* Add block */}
      {!previewMode && (
        <div className="mt-4">
          <BlockPalette onAdd={addBlock} />
        </div>
      )}

      {/* Subsections */}
      {(section.subsections.length > 0 || !previewMode) && depth === 0 && (
        <div className="mt-6 space-y-3">
          {section.subsections.length > 0 && (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Subsections
            </p>
          )}
          <SectionList
            sections={section.subsections}
            onChange={(subs) => onUpdate({ ...section, subsections: subs })}
            previewMode={previewMode}
            depth={depth + 1}
          />
          {!previewMode && (
            <Button size="sm" variant="outline" onClick={addSubsection}>
              + Add subsection
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
