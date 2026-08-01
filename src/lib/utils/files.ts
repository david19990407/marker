const ASSIGNMENT_RESOURCE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/mp3",
  "video/mp4",
  "video/webm",
]);

const SUBMISSION_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const VIDEO_FILE_TYPES = new Set(["video/mp4", "video/webm"]);

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "sh",
  "js",
  "msi",
  "com",
  "scr",
  "ps1",
  "jar",
]);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 80 * 1024 * 1024;

export function sanitiseFileName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1)! : "";
}

export type UploadKind =
  | "assignment-resource"
  | "submission"
  | "block-image"
  | "block-video"
  | "block-download";

function maxBytesForKind(kind: UploadKind) {
  return kind === "block-video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

export function assertSafeUpload(file: File, kind: UploadKind) {
  if (!file || file.size <= 0) {
    throw new Error("No file provided");
  }
  if (file.size > maxBytesForKind(kind)) {
    throw new Error(
      kind === "block-video"
        ? "Video must be 80MB or smaller"
        : "File must be 20MB or smaller",
    );
  }

  const ext = fileExtension(file.name);
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("This file type is not allowed");
  }

  const mime = file.type || guessMimeFromExtension(ext);

  if (kind === "block-image") {
    if (!IMAGE_TYPES.has(mime) && !["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
      throw new Error("Allowed images: PNG, JPG, JPEG, WebP, SVG");
    }
  } else if (kind === "block-video") {
    if (!VIDEO_FILE_TYPES.has(mime) && !["mp4", "webm"].includes(ext)) {
      throw new Error("Allowed videos: MP4 or WebM");
    }
  } else if (kind === "submission") {
    if (!SUBMISSION_TYPES.has(mime) && !allowedExtension(ext, "submission")) {
      throw new Error("Allowed: PDF or Word documents");
    }
  } else if (
    !ASSIGNMENT_RESOURCE_TYPES.has(mime) &&
    !allowedExtension(ext, "assignment-resource")
  ) {
    throw new Error(
      "Allowed: PDF, Word, Excel, PowerPoint, TXT, CSV, PNG, JPG, WebP, SVG, MP3, MP4, WebM",
    );
  }

  return { mime, safeName: sanitiseFileName(file.name) };
}

/** Reject SVG payloads that contain scriptable content. */
export function assertSafeSvg(bytes: Buffer) {
  const text = bytes.toString("utf8").slice(0, 500_000).toLowerCase();
  if (
    text.includes("<script") ||
    text.includes("javascript:") ||
    text.includes("onerror=") ||
    text.includes("onload=") ||
    text.includes("<foreignobject")
  ) {
    throw new Error("This SVG contains unsafe content and was rejected");
  }
}

function allowedExtension(ext: string, kind: "assignment-resource" | "submission") {
  if (kind === "submission") return ["pdf", "doc", "docx"].includes(ext);
  return [
    "pdf",
    "doc",
    "docx",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "txt",
    "csv",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "svg",
    "mp3",
    "mp4",
    "webm",
  ].includes(ext);
}

function guessMimeFromExtension(ext: string) {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return map[ext] ?? "";
}

export function buildStoragePath(userId: string, ...parts: string[]) {
  return [userId, ...parts.map(sanitiseFileName)].join("/");
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
