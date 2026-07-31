"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  defaultTableCells,
  defaultTableConfig,
} from "@/lib/homework/structure";
import type { BuilderBlock, TableCellDef, TableCellType } from "@/lib/types";

const CELL_TYPE_OPTIONS: { value: TableCellType; label: string }[] = [
  { value: "student_text", label: "Student text" },
  { value: "student_numeric", label: "Student numeric" },
  { value: "tick", label: "Tick" },
  { value: "teacher_review", label: "Teacher review" },
  { value: "readonly", label: "Read-only / instructional" },
];

interface Props {
  block: BuilderBlock;
  onChange: (b: BuilderBlock) => void;
}

export function TableEditor({ block, onChange }: Props) {
  const cfg = block.tableConfig ?? defaultTableConfig();
  const cells = block.cells ?? defaultTableCells(cfg.rows, cfg.cols);

  function setConfig<K extends keyof typeof cfg>(key: K, value: (typeof cfg)[K]) {
    const nextCfg = { ...cfg, [key]: value };
    onChange({ ...block, tableConfig: nextCfg });
  }

  function resizeTable(rows: number, cols: number) {
    const nextCells: TableCellDef[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const existing = cells.find(
          (cell) => cell.row_index === r && cell.col_index === c,
        );
        nextCells.push(
          existing ?? {
            row_index: r,
            col_index: c,
            cell_type: "student_text",
            label: null,
            marks: null,
            read_only: false,
          },
        );
      }
    }
    onChange({
      ...block,
      tableConfig: { ...cfg, rows, cols },
      cells: nextCells,
    });
  }

  function updateCell(rowIdx: number, colIdx: number, updates: Partial<TableCellDef>) {
    const nextCells = cells.map((c) =>
      c.row_index === rowIdx && c.col_index === colIdx ? { ...c, ...updates } : c,
    );
    onChange({ ...block, cells: nextCells });
  }

  function updateColLabel(colIdx: number, label: string) {
    const nextLabels = [...(cfg.col_labels ?? [])];
    nextLabels[colIdx] = label;
    setConfig("col_labels", nextLabels);
  }

  function moveRow(rowIdx: number, dir: -1 | 1) {
    const targetRow = rowIdx + dir;
    if (targetRow < 0 || targetRow >= cfg.rows) return;
    const nextCells = cells.map((c) => {
      if (c.row_index === rowIdx) return { ...c, row_index: targetRow };
      if (c.row_index === targetRow) return { ...c, row_index: rowIdx };
      return c;
    });
    onChange({ ...block, cells: nextCells });
  }

  function moveCol(colIdx: number, dir: -1 | 1) {
    const targetCol = colIdx + dir;
    if (targetCol < 0 || targetCol >= cfg.cols) return;
    const nextLabels = [...(cfg.col_labels ?? [])];
    [nextLabels[colIdx], nextLabels[targetCol]] = [nextLabels[targetCol], nextLabels[colIdx]];
    const nextCells = cells.map((c) => {
      if (c.col_index === colIdx) return { ...c, col_index: targetCol };
      if (c.col_index === targetCol) return { ...c, col_index: colIdx };
      return c;
    });
    onChange({ ...block, tableConfig: { ...cfg, col_labels: nextLabels }, cells: nextCells });
  }

  const startRow = cfg.header_row ? 1 : 0;

  return (
    <div className="space-y-4">
      {/* Dimensions */}
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Rows</span>
          <Input
            type="number"
            min={1}
            max={20}
            value={cfg.rows}
            onChange={(e) => resizeTable(Number(e.target.value) || 1, cfg.cols)}
            className="w-20"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Columns</span>
          <Input
            type="number"
            min={1}
            max={10}
            value={cfg.cols}
            onChange={(e) => resizeTable(cfg.rows, Number(e.target.value) || 1)}
            className="w-20"
          />
        </label>
        <label className="flex items-end gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={cfg.header_row}
            onChange={(e) => setConfig("header_row", e.target.checked)}
          />
          Header row
        </label>
      </div>

      {/* Column labels */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500">Column labels</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: cfg.cols }, (_, ci) => (
            <div key={ci} className="flex items-center gap-1">
              <Input
                value={(cfg.col_labels ?? [])[ci] ?? ""}
                onChange={(e) => updateColLabel(ci, e.target.value)}
                placeholder={`Col ${ci + 1}`}
                className="w-28"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveCol(ci, -1)}
                disabled={ci === 0}
                aria-label={`Move column ${ci + 1} left`}
              >
                ←
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => moveCol(ci, 1)}
                disabled={ci === cfg.cols - 1}
                aria-label={`Move column ${ci + 1} right`}
              >
                →
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Cell grid */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-xs">
          <thead>
            {cfg.header_row && (
              <tr className="bg-slate-100">
                <th className="px-3 py-2 text-left font-medium text-slate-500">Row</th>
                {Array.from({ length: cfg.cols }, (_, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-medium text-slate-700">
                    {(cfg.col_labels ?? [])[ci] ?? `Col ${ci + 1}`}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {Array.from({ length: cfg.rows - startRow }, (_, rowOffset) => {
              const ri = rowOffset + startRow;
              return (
                <tr key={ri} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">R{ri + 1}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveRow(ri, -1)}
                        disabled={ri <= startRow}
                        aria-label={`Move row ${ri + 1} up`}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveRow(ri, 1)}
                        disabled={ri >= cfg.rows - 1}
                        aria-label={`Move row ${ri + 1} down`}
                      >
                        ↓
                      </Button>
                    </div>
                  </td>
                  {Array.from({ length: cfg.cols }, (_, ci) => {
                    const cell = cells.find(
                      (c) => c.row_index === ri && c.col_index === ci,
                    );
                    if (!cell) return <td key={ci} />;
                    return (
                      <td key={ci} className="px-2 py-1">
                        <div className="space-y-1">
                          <select
                            value={cell.cell_type}
                            onChange={(e) =>
                              updateCell(ri, ci, {
                                cell_type: e.target.value as TableCellType,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs"
                          >
                            {CELL_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <Input
                            value={cell.label ?? ""}
                            onChange={(e) =>
                              updateCell(ri, ci, { label: e.target.value || null })
                            }
                            placeholder="Label"
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={cell.marks ?? ""}
                            onChange={(e) =>
                              updateCell(ri, ci, {
                                marks: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Marks"
                            className="h-8 w-16 text-xs"
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
