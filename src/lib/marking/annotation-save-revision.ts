import type { SubmissionAnnotation } from "@/lib/marking/annotation-types";

/** True when a slower earlier save must not overwrite newer local state. */
export function isStaleAnnotationSaveResponse(
  latestSeqForId: number | undefined,
  responseSeq: number,
): boolean {
  return latestSeqForId !== undefined && latestSeqForId !== responseSeq;
}

/**
 * Merge a successful server annotation into local state without replacing
 * newer typed text / geometry from a later revision.
 */
export function mergeAnnotationAfterSave(
  local: SubmissionAnnotation,
  server: SubmissionAnnotation,
): SubmissionAnnotation {
  const localNewer =
    local.client_version > server.client_version ||
    (local.updated_at &&
      server.updated_at &&
      local.updated_at > server.updated_at);

  if (localNewer) {
    return {
      ...local,
      id: server.id || local.id,
      client_version: Math.max(local.client_version, server.client_version),
      created_by: server.created_by || local.created_by,
      created_at: server.created_at || local.created_at,
    };
  }

  return {
    ...local,
    id: server.id || local.id,
    client_version: server.client_version,
    created_by: server.created_by || local.created_by,
    created_at: server.created_at || local.created_at,
    updated_at: server.updated_at || local.updated_at,
    // Prefer local text when versions are equal but local draft is ahead
    // via updated_at already handled above; otherwise take server text.
    text_content: server.text_content ?? local.text_content,
    text_snapshot: server.text_snapshot ?? local.text_snapshot,
    geometry: server.geometry ?? local.geometry,
    x_norm: server.x_norm,
    y_norm: server.y_norm,
    w_norm: server.w_norm,
    h_norm: server.h_norm,
  };
}
