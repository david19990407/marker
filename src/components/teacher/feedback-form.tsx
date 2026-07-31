"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  reopenSubmissionAction,
  saveFeedbackAction,
} from "@/lib/actions/teacher";
import type { ActionResult } from "@/lib/actions/auth";
import type { Feedback } from "@/lib/types";

const initial: ActionResult = {};

export function FeedbackForm({
  submissionId,
  maximumMark,
  feedback,
}: {
  submissionId: string;
  maximumMark: number;
  feedback?: Feedback | null;
}) {
  const [draftState, draftAction, draftPending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "draft"),
    initial,
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "release"),
    initial,
  );
  const [returnState, returnAction, returnPending] = useActionState(
    saveFeedbackAction.bind(null, submissionId, "return_unmarked"),
    initial,
  );
  const [isPending, startTransition] = useTransition();
  const [reopenFlash, setReopenFlash] = useState<ActionResult>({});

  const message =
    draftState.success ||
    draftState.error ||
    releaseState.success ||
    releaseState.error ||
    returnState.success ||
    returnState.error ||
    reopenFlash.success ||
    reopenFlash.error;

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      <form className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">
            Mark (out of {maximumMark})
          </span>
          <Input
            name="mark"
            type="number"
            min={0}
            max={maximumMark}
            step="0.5"
            defaultValue={feedback?.mark ?? ""}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Strengths</span>
          <Textarea name="strengths" defaultValue={feedback?.strengths ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Improvements</span>
          <Textarea
            name="improvements"
            defaultValue={feedback?.improvements ?? ""}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">Next steps</span>
          <Textarea name="next_steps" defaultValue={feedback?.next_steps ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-500">
            Private notes (not shown to student)
          </span>
          <Textarea
            name="private_notes"
            defaultValue={feedback?.private_notes ?? ""}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button formAction={draftAction} disabled={draftPending}>
            {draftPending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            formAction={releaseAction}
            variant="secondary"
            disabled={releasePending}
          >
            {releasePending ? "Releasing…" : "Release mark & feedback"}
          </Button>
          <Button
            formAction={returnAction}
            variant="outline"
            disabled={returnPending}
          >
            {returnPending ? "Returning…" : "Return without mark"}
          </Button>
        </div>
      </form>

      <Button
        type="button"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setReopenFlash(await reopenSubmissionAction(submissionId));
          })
        }
      >
        Reopen submission
      </Button>
    </div>
  );
}
