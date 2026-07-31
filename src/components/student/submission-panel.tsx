"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  saveSubmissionDraftAction,
  submitHomeworkAction,
  uploadSubmissionFileAction,
} from "@/lib/actions/student";
import type { ActionResult } from "@/lib/actions/auth";
import { DownloadButton } from "@/components/shared/download-button";

const initial: ActionResult = {};

export function SubmissionPanel({
  assignmentId,
  allowText,
  allowFile,
  editable,
  writtenResponse,
  fileName,
  storagePath,
}: {
  assignmentId: string;
  allowText: boolean;
  allowFile: boolean;
  editable: boolean;
  writtenResponse: string | null;
  fileName: string | null;
  storagePath: string | null;
}) {
  const [draftState, draftAction, draftPending] = useActionState(
    saveSubmissionDraftAction.bind(null, assignmentId),
    initial,
  );
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!editable) {
    return (
      <div className="space-y-4">
        {allowText ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Your written response</h3>
            <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {writtenResponse || "—"}
            </p>
          </div>
        ) : null}
        {allowFile ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Uploaded file</h3>
            {storagePath && fileName ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{fileName}</p>
                <DownloadButton bucket="student-submissions" path={storagePath} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No file uploaded</p>
            )}
          </div>
        ) : null}
        <p className="text-sm text-slate-500">
          This submission is locked. Wait for your teacher if it needs to be
          reopened.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(draftState.success || draftState.error || flash) && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          {draftState.success || draftState.error || flash}
        </div>
      )}

      {allowText ? (
        <form action={draftAction} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-500">Written response</span>
            <Textarea
              name="written_response"
              className="min-h-48"
              defaultValue={writtenResponse ?? ""}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={draftPending}>
            {draftPending ? "Saving…" : "Save draft"}
          </Button>
        </form>
      ) : null}

      {allowFile ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Current file: {fileName ?? "None"}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              disabled={!file || pending}
              onClick={() =>
                startTransition(async () => {
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  const r = await uploadSubmissionFileAction(assignmentId, fd);
                  setFlash(r.success || r.error || null);
                  if (r.success) setFile(null);
                })
              }
            >
              {pending ? "Uploading…" : "Upload / replace file"}
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await submitHomeworkAction(assignmentId);
            setFlash(r.success || r.error || null);
          })
        }
      >
        Submit homework
      </Button>
    </div>
  );
}
