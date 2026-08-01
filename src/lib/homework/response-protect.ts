/**
 * Guards structured response upserts against stale / empty client snapshots.
 * A status transition must never clear answers; empty clears require a newer
 * client_version (explicit delete while editable).
 */

export type StructuredUpsertSkipReason =
  | "stale_version"
  | "empty_overwrite"
  | null;

export function shouldSkipStructuredUpsert(input: {
  incomingEmpty: boolean;
  existingPopulated: boolean;
  incomingVersion: number | null;
  existingVersion: number;
}): boolean {
  return structuredUpsertSkipReason(input) != null;
}

export function structuredUpsertSkipReason(input: {
  incomingEmpty: boolean;
  existingPopulated: boolean;
  incomingVersion: number | null;
  existingVersion: number;
}): StructuredUpsertSkipReason {
  const {
    incomingEmpty,
    existingPopulated,
    incomingVersion,
    existingVersion,
  } = input;

  if (
    incomingVersion != null &&
    existingVersion > 0 &&
    incomingVersion < existingVersion
  ) {
    return "stale_version";
  }

  if (incomingEmpty && existingPopulated) {
    if (incomingVersion == null || incomingVersion <= existingVersion) {
      return "empty_overwrite";
    }
  }

  return null;
}

/** Stable fingerprint of answer content (never logs raw student text). */
export function structuredResponseFingerprint(input: {
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
  file_name?: string | null;
  storage_path?: string | null;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
  }>;
}): string {
  const cells = (input.cells ?? [])
    .map(
      (c) =>
        `${c.row_index}:${c.col_index}:${String(c.text_value ?? "").trim()}|${c.numeric_value ?? ""}|${c.boolean_value ?? ""}`,
    )
    .sort()
    .join(";");
  let jsonPart = "";
  if (input.json_value != null && typeof input.json_value === "object") {
    const json = input.json_value as { kind?: string; option_ids?: unknown[] };
    if (json.kind === "mcq" && Array.isArray(json.option_ids)) {
      jsonPart = `mcq:${[...json.option_ids].map(String).sort().join(",")}`;
    } else {
      try {
        jsonPart = JSON.stringify(input.json_value);
      } catch {
        jsonPart = "json";
      }
    }
  }
  return [
    String(input.text_value ?? "").trim(),
    input.numeric_value ?? "",
    input.boolean_value ?? "",
    jsonPart,
    String(input.file_name ?? ""),
    String(input.storage_path ?? ""),
    cells,
  ].join("::");
}

export function maxClientVersionFromRows(
  rows: Array<{ client_version?: number | null } | null | undefined>,
): number {
  let max = 0;
  for (const row of rows) {
    const v = Number(row?.client_version ?? 0);
    if (Number.isFinite(v) && v > max) max = Math.floor(v);
  }
  return max;
}

type RankableResponse = {
  question_id?: string | null;
  client_version?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  id?: string | null;
};

function responseRank(row: RankableResponse): [number, number, number, string] {
  return [
    Number(row.client_version ?? 0) || 0,
    row.updated_at ? Date.parse(row.updated_at) || 0 : 0,
    row.created_at ? Date.parse(row.created_at) || 0 : 0,
    String(row.id ?? ""),
  ];
}

function isNewerResponse(a: RankableResponse, b: RankableResponse): boolean {
  const ra = responseRank(a);
  const rb = responseRank(b);
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i]! > rb[i]!) return true;
    if (ra[i]! < rb[i]!) return false;
  }
  return false;
}

/**
 * Temporary fallback while duplicate active rows may still exist:
 * keep the latest valid row per question_id.
 */
export function pickAuthoritativeResponsesByQuestion<T extends RankableResponse>(
  rows: T[],
): Map<string, T> {
  const byQuestion = new Map<string, T>();
  for (const row of rows) {
    const qid = String(row.question_id ?? "");
    if (!qid) continue;
    const existing = byQuestion.get(qid);
    if (!existing || isNewerResponse(row, existing)) {
      byQuestion.set(qid, row);
    }
  }
  return byQuestion;
}
