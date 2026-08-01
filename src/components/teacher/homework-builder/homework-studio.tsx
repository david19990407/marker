"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVersionedAutosave } from "@/hooks/use-versioned-autosave";
import { saveHomeworkStructureAction } from "@/lib/actions/homework-builder";
import { calculateTotalMarks, formatMarks } from "@/lib/homework/marks";
import { createBlock, emptySection } from "@/lib/homework/structure";
import type {
  Assignment,
  AssignmentCommentDraft,
  BuilderSection,
  BuilderStage,
} from "@/lib/types";
import { ContentCanvas, StudentPreview } from "./content-canvas";
import {
  ResourceStage,
  type AssignmentResourceSummary,
  type MarkSchemeSummary,
} from "./resource-stage";
import { FeedbackStage, type CommentBankOption } from "./feedback-stage";

interface Props {
  assignment: Assignment & { template_id: string };
  initialSections: BuilderSection[];
  classNames: string[];
  previewOnly?: boolean;
  resources?: AssignmentResourceSummary[];
  markSchemes?: MarkSchemeSummary[];
  initialComments?: AssignmentCommentDraft[];
  commentBanks?: CommentBankOption[];
  linkedCommentBankIds?: string[];
}

const STAGES: Array<{ id: BuilderStage; label: string }> = [
  { id: "details", label: "Details" },
  { id: "classes", label: "Classes" },
  { id: "content", label: "Content" },
  { id: "resources", label: "Resources" },
  { id: "feedback", label: "Feedback" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
];

export function HomeworkStudio({
  assignment,
  initialSections,
  classNames,
  previewOnly = false,
  resources = [],
  markSchemes = [],
  initialComments = [],
  commentBanks = [],
  linkedCommentBankIds = [],
}: Props) {
  const [sections, setSections] = useState<BuilderSection[]>(initialSections);
  const [activeStage, setActiveStage] = useState<BuilderStage>(
    previewOnly ? "preview" : "content",
  );
  const [issuedAcknowledged, setIssuedAcknowledged] = useState(
    assignment.status !== "published",
  );
  const [details, setDetails] = useState({
    title: assignment.title,
    overview: assignment.instructions ?? "",
  });

  const totalMarks = useMemo(() => calculateTotalMarks(sections), [sections]);
  const autosave = useVersionedAutosave<BuilderSection[]>({
    delayMs: 1200,
    enabled: !previewOnly,
    save: async (value) => {
      const result = await saveHomeworkStructureAction(assignment.template_id, value);
      return result.error ? { ok: false, error: result.error } : { ok: true };
    },
  });

  function confirmIssuedEdit() {
    if (assignment.status !== "published" || issuedAcknowledged) return true;
    const ok = window.confirm(
      "This homework has already been published. Editing content may change what students see and can affect in-progress work. Continue?",
    );
    if (ok) setIssuedAcknowledged(true);
    return ok;
  }

  function updateSections(next: BuilderSection[]) {
    if (previewOnly) return;
    if (!confirmIssuedEdit()) return;
    setSections(next);
    autosave.markDirty(next);
  }

  function updateLocalDetails(patch: Partial<typeof details>) {
    if (!confirmIssuedEdit()) return;
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  function addExternalVideoBlock(url: string) {
    if (!confirmIssuedEdit()) return;
    const block = createBlock("embedded_video");
    block.external_url = url;
    block.content = "Video";
    block.prompt = "Watch this video before answering the questions.";

    const nextSections =
      sections.length > 0
        ? sections.map((section, index) =>
            index === 0 ? { ...section, blocks: [...section.blocks, block] } : section,
          )
        : [{ ...emptySection(), blocks: [block] }];

    setSections(nextSections);
    autosave.markDirty(nextSections);
    setActiveStage("content");
  }

  const classSummary = classNames.length > 0 ? classNames.join(", ") : "No classes selected";
  const statusTone = assignment.status === "published" ? "success" : "neutral";

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {details.title || assignment.title}
              </h1>
              <Badge tone={statusTone}>{assignment.status}</Badge>
              <Badge tone="brand">{formatMarks(totalMarks)} marks</Badge>
            </div>
            <p className="text-sm text-slate-500">{classSummary}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  autosave.status === "error"
                    ? "danger"
                    : autosave.status === "dirty"
                      ? "warning"
                      : "neutral"
                }
              >
                {previewOnly ? "Preview only" : autosave.label}
              </Badge>
              {autosave.lastError ? (
                <span className="text-sm text-rose-600">{autosave.lastError}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeStage === "preview" ? "primary" : "secondary"}
              onClick={() => setActiveStage("preview")}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void autosave.flush()}
              disabled={previewOnly}
            >
              Save draft
            </Button>
            <Button type="button" onClick={() => setActiveStage("publish")}>
              Publish stage
            </Button>
          </div>
        </div>

        {assignment.status === "published" && !previewOnly ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This assignment is published. Homework Studio will ask you to confirm before
            the first edit in this session.
          </div>
        ) : null}

        {!previewOnly ? (
          <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 pt-4">
            {STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-medium transition ${
                  activeStage === stage.id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {stage.label}
              </button>
            ))}
          </nav>
        ) : null}
      </Card>

      {activeStage === "details" ? (
        <DetailsStage details={details} onChange={updateLocalDetails} />
      ) : null}

      {activeStage === "classes" ? <ClassesStage classNames={classNames} /> : null}

      {activeStage === "content" ? (
        <ContentCanvas
          sections={sections}
          onChange={updateSections}
          commentBanks={commentBanks}
        />
      ) : null}

      {activeStage === "resources" ? (
        <ResourceStage
          assignmentId={assignment.id}
          templateId={assignment.template_id}
          resources={resources}
          markSchemes={markSchemes}
          onAddExternalVideo={addExternalVideoBlock}
        />
      ) : null}

      {activeStage === "feedback" ? (
        <FeedbackStage
          templateId={assignment.template_id}
          sections={sections}
          initialComments={initialComments}
          commentBanks={commentBanks}
          linkedCommentBankIds={linkedCommentBankIds}
        />
      ) : null}

      {activeStage === "preview" ? (
        <StudentPreview sections={sections} />
      ) : null}

      {activeStage === "publish" ? <PublishStage assignmentId={assignment.id} /> : null}
    </div>
  );
}

function DetailsStage({
  details,
  onChange,
}: {
  details: { title: string; overview: string };
  onChange: (patch: Partial<{ title: string; overview: string }>) => void;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Homework details</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          These fields are local to Homework Studio for now. Publish status and dates are
          managed in the Publish stage.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Title</span>
        <Input
          value={details.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Homework title"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">Overview</span>
        <Textarea
          value={details.overview}
          onChange={(e) => onChange({ overview: e.target.value })}
          placeholder="Short overview for students"
        />
      </label>
    </Card>
  );
}

function ClassesStage({ classNames }: { classNames: string[] }) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Classes</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Class allocation is shown here read-only. Release dates and due dates are edited
          in the Publish stage.
        </p>
      </div>
      {classNames.length === 0 ? (
        <p className="text-sm text-slate-500">No classes attached.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classNames.map((name) => (
            <li
              key={name}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PublishStage({ assignmentId }: { assignmentId: string }) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Publish and schedule</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Status, release date, due date, and publishing controls are managed on the
          assignment edit page.
        </p>
      </div>
      <Link href={`/teacher/assignments/${assignmentId}/edit`}>
        <Button>Open publish settings</Button>
      </Link>
    </Card>
  );
}
