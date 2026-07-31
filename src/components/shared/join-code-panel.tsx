"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function JoinCodePanel({
  joinCode,
  archived,
  onRegenerate,
}: {
  joinCode: string;
  archived?: boolean;
  onRegenerate: () => Promise<{ success?: string; error?: string; code?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState(joinCode);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-slate-500">Join code</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-slate-900">
          {code}
        </p>
      </div>
      {archived ? (
        <p className="text-sm text-amber-700">
          Join codes cannot be regenerated while the class is archived.
        </p>
      ) : confirming ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-3">
            Regenerating will invalidate <span className="font-mono">{code}</span>.
            Existing members stay enrolled, but students will need the new code
            to join.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await onRegenerate();
                  if (result.error) {
                    setMessage(result.error);
                  } else {
                    if (result.code) setCode(result.code);
                    setMessage(result.success || "Join code updated");
                    setConfirming(false);
                  }
                })
              }
            >
              {pending ? "Updating…" : "Confirm new code"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Regenerate join code
        </Button>
      )}
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
