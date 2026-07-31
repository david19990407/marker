"use client";

import { JoinCodePanel } from "@/components/shared/join-code-panel";
import { adminRegenerateJoinCodeAction } from "@/lib/actions/admin-classes";

export function AdminJoinCodePanel({
  classId,
  joinCode,
  archived,
}: {
  classId: string;
  joinCode: string;
  archived?: boolean;
}) {
  return (
    <JoinCodePanel
      joinCode={joinCode}
      archived={archived}
      onRegenerate={() => adminRegenerateJoinCodeAction(classId)}
    />
  );
}
