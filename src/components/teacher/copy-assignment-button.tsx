"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { copyAssignmentAction } from "@/lib/actions/teacher";

export function CopyAssignmentButton({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await copyAssignmentAction(assignmentId);
        });
      }}
    >
      {pending ? "Copying…" : "Copy"}
    </Button>
  );
}
