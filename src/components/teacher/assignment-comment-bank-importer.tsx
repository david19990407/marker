"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importCommentBankToAssignmentAction } from "@/lib/actions/comment-bank-groups";
import type { CommentBank } from "@/lib/feedback/types";

export function AssignmentCommentBankImporter({
  templateId,
  banks,
}: {
  templateId: string;
  banks: CommentBank[];
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"link" | "copy">("link");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return banks
      .filter((b) => b.scope === "school" || b.scope === "department")
      .filter(
        (b) =>
          !q ||
          b.name.toLowerCase().includes(q) ||
          (b.subject ?? "").toLowerCase().includes(q) ||
          (b.department_name ?? "").toLowerCase().includes(q),
      );
  }, [banks, query]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Add an administrator comment bank as one unit.{" "}
        <strong>Link</strong> keeps receiving source updates.{" "}
        <strong>Copy</strong> creates an assignment-specific bank that will not
        be overwritten by later source edits.
      </p>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search available banks"
        aria-label="Search comment banks"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "link" ? "secondary" : "outline"}
          onClick={() => setMode("link")}
        >
          Link bank
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "copy" ? "secondary" : "outline"}
          onClick={() => setMode("copy")}
        >
          Copy bank
        </Button>
      </div>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      <ul className="space-y-2">
        {filtered.map((bank) => (
          <li
            key={bank.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{bank.name}</p>
              <p className="text-xs text-slate-500">
                {bank.scope}
                {bank.subject ? ` · ${bank.subject}` : ""}
                {bank.description ? ` · ${bank.description}` : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMessage(null);
                startTransition(async () => {
                  const result = await importCommentBankToAssignmentAction({
                    templateId,
                    sourceBankId: bank.id,
                    mode,
                  });
                  if (result.error) setError(result.error);
                  else setMessage(result.success ?? "Bank added");
                });
              }}
            >
              Add comment bank
            </Button>
          </li>
        ))}
      </ul>
      {!filtered.length ? (
        <p className="text-sm text-slate-500">No matching school banks found.</p>
      ) : null}
    </div>
  );
}
