const ASSIGNMENT_RESOURCE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const SUBMISSION_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

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

export function sanitiseFileName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1)! : "";
}

export function assertSafeUpload(
  file: File,
  kind: "assignment-resource" | "submission",
) {
  if (!file || file.size <= 0) {
    throw new Error("No file provided");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File must be 20MB or smaller");
  }

  const ext = fileExtension(file.name);
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("This file type is not allowed");
  }

  const allowed =
    kind === "assignment-resource"
      ? ASSIGNMENT_RESOURCE_TYPES
      : SUBMISSION_TYPES;

  // Some browsers send empty type for docx/pptx — fall back to extension.
  const mime = file.type || guessMimeFromExtension(ext);
  if (!allowed.has(mime) && !allowedExtension(ext, kind)) {
    throw new Error(
      kind === "assignment-resource"
        ? "Allowed: PDF, Word, PowerPoint, PNG, JPG, WebP"
        : "Allowed: PDF or Word documents",
    );
  }

  return { mime, safeName: sanitiseFileName(file.name) };
}

function allowedExtension(
  ext: string,
  kind: "assignment-resource" | "submission",
) {
  if (kind === "submission") return ["pdf", "doc", "docx"].includes(ext);
  return ["pdf", "doc", "docx", "ppt", "pptx", "png", "jpg", "jpeg", "webp"].includes(
    ext,
  );
}

function guessMimeFromExtension(ext: string) {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext] ?? "";
}

export function buildStoragePath(userId: string, ...parts: string[]) {
  return [userId, ...parts.map(sanitiseFileName)].join("/");
}
