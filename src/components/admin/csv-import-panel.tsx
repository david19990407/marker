"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  confirmCsvImportAction,
  previewCsvImportAction,
  type ImportSummary,
} from "@/lib/actions/admin";
import { CSV_TEMPLATE, type ParsedCsvRow } from "@/lib/utils/csv";

export function CsvImportPanel() {
  const [csvText, setCsvText] = useState(CSV_TEMPLATE);
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const validCount = rows.filter((r) => r.data && r.errors.length === 0).length;
  const invalidCount = rows.filter((r) => r.errors.length > 0).length;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Upload or paste CSV</CardTitle>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
            download="homework-passport-users-template.csv"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Download example CSV
          </a>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-slate-600"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setCsvText(await file.text());
            setRows([]);
            setSummary(null);
          }}
        />
        <Textarea
          className="min-h-48 font-mono text-xs"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setRows([]);
            setSummary(null);
          }}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setSummary(null);
                const result = await previewCsvImportAction(csvText);
                if (result.error) setError(result.error);
                setRows(result.rows);
              })
            }
          >
            Validate & preview
          </Button>
          <Button
            type="button"
            disabled={pending || validCount === 0 || invalidCount > 0}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await confirmCsvImportAction(csvText);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setSummary(result.summary ?? null);
              })
            }
          >
            Confirm import
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : null}
        {rows.length > 0 ? (
          <p className="text-sm text-slate-500">
            {validCount} valid · {invalidCount} with errors. Fix all errors
            before confirming.
          </p>
        ) : null}
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardTitle className="mb-4">Preview</CardTitle>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Class</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-slate-100">
                    <td className="px-2 py-2">{row.rowNumber}</td>
                    <td className="px-2 py-2">
                      {row.raw.first_name} {row.raw.last_name}
                    </td>
                    <td className="px-2 py-2">{row.raw.email}</td>
                    <td className="px-2 py-2">{row.raw.role}</td>
                    <td className="px-2 py-2">{row.raw.class_name || "—"}</td>
                    <td className="px-2 py-2">
                      {row.errors.length ? (
                        <Badge tone="danger">{row.errors[0]}</Badge>
                      ) : (
                        <Badge tone="success">Valid</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardTitle className="mb-2">Import summary</CardTitle>
          <p className="text-sm text-slate-600">
            Successful: {summary.successful} · Skipped: {summary.skipped} ·
            Failed: {summary.failed}
          </p>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
            {summary.details.map((d) => (
              <li
                key={`${d.rowNumber}-${d.email}`}
                className="rounded-xl bg-slate-50 px-3 py-2"
              >
                Row {d.rowNumber} · {d.email} · {d.status}: {d.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
