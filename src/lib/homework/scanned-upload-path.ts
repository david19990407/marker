import { sanitiseFileName } from "@/lib/utils/files";

/**
 * Deterministic student-submissions object path.
 *
 * Folder [1] MUST be the authenticated student id so the existing
 * `Students manage own submission files` storage policy
 * (`(storage.foldername(name))[1] = auth.uid()`) authorises direct
 * browser uploads. Remaining segments identify assignment/submission
 * context without trusting client-supplied path fragments.
 */
export function buildStudentUploadPath(parts: {
  studentId: string;
  assignmentId: string;
  submissionId: string;
  blockId: string;
  version: number;
  fileId: string;
  fileName: string;
}): string {
  const safe = sanitiseFileName(parts.fileName);
  return [
    parts.studentId,
    parts.assignmentId,
    parts.submissionId,
    parts.blockId,
    `v${Math.max(1, Math.floor(parts.version))}`,
    parts.fileId,
    safe,
  ].join("/");
}

export function isStudentOwnedStoragePath(
  storagePath: string,
  studentId: string,
): boolean {
  return storagePath.startsWith(`${studentId}/`);
}

export type ScannedUploadPhase =
  | "queued"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "error"
  | "stalled";

export function scannedUploadPhaseLabel(
  phase: ScannedUploadPhase,
  progress: number,
): string {
  switch (phase) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `Uploading, ${Math.round(progress)}%`;
    case "uploaded":
      return "Uploaded";
    case "processing":
      return "Preparing preview…";
    case "ready":
      return "Ready";
    case "stalled":
      return "Upload stalled";
    case "error":
      return "Failed";
    default:
      return "";
  }
}

/** True while the primary upload has not yet finished (submit must wait). */
export function isScannedUploadBusyPhase(phase: ScannedUploadPhase): boolean {
  return phase === "queued" || phase === "uploading" || phase === "stalled";
}
