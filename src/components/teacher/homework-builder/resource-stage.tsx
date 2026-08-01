"use client";

import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { uploadMarkSchemeAction } from "@/lib/actions/homework-builder";

export interface AssignmentResourceSummary {
  id: string;
  file_name?: string | null;
  title?: string | null;
  description?: string | null;
  storage_path?: string | null;
  file_type?: string | null;
  resource_kind?: string | null;
  external_url?: string | null;
  visibility?: string | null;
}

export interface MarkSchemeSummary {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
}

interface Props {
  assignmentId: string;
  templateId: string;
  resources?: AssignmentResourceSummary[];
  markSchemes?: MarkSchemeSummary[];
  onAddExternalVideo: (url: string) => void;
}

export function ResourceStage({
  assignmentId,
  templateId,
  resources = [],
  markSchemes = [],
  onAddExternalVideo,
}: Props) {
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadMessage, setUploadMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleAddVideo() {
    const trimmed = videoUrl.trim();
    if (!trimmed) return;
    onAddExternalVideo(trimmed);
    setVideoUrl("");
    setUploadMessage({
      type: "success",
      text: "Embedded video block added to the worksheet.",
    });
  }

  function handleUpload(formData: FormData) {
    setUploadMessage(null);
    startTransition(async () => {
      const result = await uploadMarkSchemeAction(templateId, formData);
      if (result.error) {
        setUploadMessage({ type: "error", text: result.error });
        return;
      }
      setUploadMessage({
        type: "success",
        text: result.success ?? "Mark scheme uploaded. Refresh to see it in this list.",
      });
      formRef.current?.reset();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Student resources</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Files and links attached to this assignment.
              </p>
            </div>
            <Badge tone="neutral">Assignment {assignmentId.slice(0, 8)}</Badge>
          </div>

          {resources.length === 0 ? (
            <p className="text-sm text-slate-500">No assignment resources yet.</p>
          ) : (
            <ul className="space-y-2">
              {resources.map((resource) => (
                <li
                  key={resource.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {resource.title || resource.file_name || resource.external_url || "Resource"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {resource.resource_kind || resource.file_type || "resource"}
                      {resource.visibility === "staff" ? " · staff only" : ""}
                    </p>
                  </div>
                  {resource.external_url ? (
                    <a
                      href={resource.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-700 underline"
                    >
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-2">Mark schemes</CardTitle>
          <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Staff-only: students cannot see mark schemes.
          </div>

          {markSchemes.length === 0 ? (
            <p className="text-sm text-slate-500">No mark scheme PDFs uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {markSchemes.map((scheme) => (
                <li
                  key={scheme.id}
                  className="rounded-2xl border border-slate-100 px-4 py-3 text-sm"
                >
                  <p className="font-medium text-slate-800">{scheme.title}</p>
                  <p className="text-xs text-slate-500">{scheme.file_name}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3">
          <CardTitle>Add external video</CardTitle>
          <p className="text-sm text-slate-500">
            Paste a video URL to add a new embedded video block to the content canvas.
          </p>
          <Input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
          />
          <Button type="button" onClick={handleAddVideo} disabled={!videoUrl.trim()}>
            Add video block
          </Button>
        </Card>

        <Card>
          <CardTitle className="mb-3">Upload mark scheme PDF</CardTitle>
          <form ref={formRef} action={handleUpload} className="space-y-3">
            <Input name="file" type="file" accept="application/pdf,.pdf" />
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading..." : "Upload PDF"}
            </Button>
          </form>
          {uploadMessage ? (
            <div
              className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                uploadMessage.type === "success"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                  : "border-rose-100 bg-rose-50 text-rose-800"
              }`}
            >
              {uploadMessage.text}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            If the upload fails, your worksheet edits stay available and you can try again.
          </p>
        </Card>
      </div>
    </div>
  );
}
