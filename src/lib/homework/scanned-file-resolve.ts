/**
 * Resolve which scanned-upload file / storage object the marking viewer
 * should open. Always uses the canonical storage path from the DB row —
 * never reconstructs a path from the original filename.
 */

export type ScannedFileLike = {
  id: string;
  block_id: string;
  submission_id: string;
  submission_version: number;
  original_storage_path: string;
  preview_storage_path: string | null;
  original_file_name: string;
  mime_type: string;
  display_order: number;
  rotation?: number;
  is_active_version: boolean;
  storage_bucket?: string | null;
};

export const SCANNED_UPLOAD_BUCKET = "student-submissions";

/** Strip accidental bucket prefixes from a stored object key. */
export function normaliseStorageObjectPath(
  path: string,
  bucket: string = SCANNED_UPLOAD_BUCKET,
): string {
  let next = path.trim().replace(/^\/+/, "");
  const prefix = `${bucket}/`;
  if (next.startsWith(prefix)) {
    next = next.slice(prefix.length);
  }
  // Reject URL-shaped values — DB must store the object key only.
  if (/^https?:\/\//i.test(next)) {
    try {
      const url = new URL(next);
      const marker = `/object/sign/${bucket}/`;
      const publicMarker = `/object/public/${bucket}/`;
      const idx = url.pathname.includes(marker)
        ? url.pathname.indexOf(marker) + marker.length
        : url.pathname.includes(publicMarker)
          ? url.pathname.indexOf(publicMarker) + publicMarker.length
          : -1;
      if (idx >= 0) {
        next = decodeURIComponent(url.pathname.slice(idx));
      }
    } catch {
      /* keep trimmed path */
    }
  }
  return next;
}

export function resolveScannedFileBucket(file: ScannedFileLike): string {
  const bucket = (file.storage_bucket || SCANNED_UPLOAD_BUCKET).trim();
  return bucket || SCANNED_UPLOAD_BUCKET;
}

/**
 * Prefer the original uploaded bytes for display. Only use a separate
 * combined preview PDF when it is explicitly different (image→PDF combine).
 */
export function resolveScannedDisplayPath(file: ScannedFileLike): {
  path: string;
  downloadPath: string;
  fileName: string;
  bucket: string;
  usesCombinedPreview: boolean;
} {
  const bucket = resolveScannedFileBucket(file);
  const original = normaliseStorageObjectPath(
    file.original_storage_path,
    bucket,
  );
  const previewRaw = file.preview_storage_path?.trim() || "";
  const preview = previewRaw
    ? normaliseStorageObjectPath(previewRaw, bucket)
    : "";
  const usesCombinedPreview =
    Boolean(preview) &&
    preview !== original &&
    preview.toLowerCase().endsWith(".pdf");
  return {
    path: usesCombinedPreview ? preview : original,
    downloadPath: original,
    fileName: usesCombinedPreview
      ? "Marking preview.pdf"
      : file.original_file_name,
    bucket,
    usesCombinedPreview,
  };
}

/** Active files for a block, latest submission_version first, then display_order. */
export function selectLatestActiveScannedFiles<T extends ScannedFileLike>(
  files: T[],
  blockId: string,
): T[] {
  const active = files.filter(
    (f) => f.block_id === blockId && f.is_active_version,
  );
  if (!active.length) return [];
  const latestVersion = Math.max(...active.map((f) => f.submission_version));
  return active
    .filter((f) => f.submission_version === latestVersion)
    .sort((a, b) => a.display_order - b.display_order);
}

export function pickPrimaryScannedFile<T extends ScannedFileLike>(
  files: T[],
  blockId: string,
): T | null {
  const latest = selectLatestActiveScannedFiles(files, blockId);
  return latest[0] ?? null;
}
