"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteAssignmentResourceAction,
  uploadAssignmentResourceAction,
} from "@/lib/actions/teacher";
import { DownloadButton } from "@/components/shared/download-button";

export function ResourceUploader({
  assignmentId,
  resources,
}: {
  assignmentId: string;
  resources: {
    id: string;
    file_name: string;
    storage_path: string;
    file_type: string;
  }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
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
              const r = await uploadAssignmentResourceAction(assignmentId, fd);
              setMessage(r.success || r.error || null);
              if (r.success) setFile(null);
            })
          }
        >
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {!resources.length ? (
        <p className="text-sm text-slate-500">No resources attached</p>
      ) : (
        <ul className="space-y-2">
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{r.file_name}</p>
                <p className="text-xs text-slate-400">{r.file_type}</p>
              </div>
              <div className="flex gap-2">
                <DownloadButton
                  bucket="assignment-resources"
                  path={r.storage_path}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteAssignmentResourceAction(
                        r.id,
                        assignmentId,
                      );
                      setMessage(res.success || res.error || null);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
