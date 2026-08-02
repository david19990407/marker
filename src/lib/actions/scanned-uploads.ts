"use server";

import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { buildNormalisedMarkingPdf } from "@/lib/homework/scanned-upload-preview";
import {
  buildStudentUploadPath,
  isStudentOwnedStoragePath,
} from "@/lib/homework/scanned-upload-path";
import type { ActionResult } from "@/lib/actions/auth";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type ScannedUploadFileRow = {
  id: string;
  submission_id: string;
  block_id: string;
  question_id: string | null;
  submission_version: number;
  original_storage_path: string;
  preview_storage_path: string | null;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  page_count: number | null;
  display_order: number;
  rotation: number;
  is_active_version: boolean;
  uploaded_at: string;
};

function mapFile(row: Record<string, unknown>): ScannedUploadFileRow {
  return {
    id: String(row.id),
    submission_id: String(row.submission_id),
    block_id: String(row.block_id),
    question_id: (row.question_id as string | null) ?? null,
    submission_version: Number(row.submission_version ?? 1),
    original_storage_path: String(row.original_storage_path),
    preview_storage_path: (row.preview_storage_path as string | null) ?? null,
    original_file_name: String(row.original_file_name),
    mime_type: String(row.mime_type),
    file_size: Number(row.file_size ?? 0),
    page_count: row.page_count == null ? null : Number(row.page_count),
    display_order: Number(row.display_order ?? 0),
    rotation: Number(row.rotation ?? 0),
    is_active_version: Boolean(row.is_active_version),
    uploaded_at: String(row.uploaded_at ?? row.created_at ?? ""),
  };
}

async function assertSubmissionAccess(
  submissionId: string,
  roles: Array<"student" | "teacher" | "admin"> = [
    "student",
    "teacher",
    "admin",
  ],
) {
  const profile = await requireProfile(roles);
  const supabase = await createClient();
  const { data: submission, error } = await supabase
    .from("submissions")
    .select("id, student_id, status, assignment_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !submission) {
    return {
      profile,
      supabase,
      submission: null as null,
      error: error?.message ?? "Submission not found",
    };
  }
  if (profile.role === "student" && submission.student_id !== profile.id) {
    return {
      profile,
      supabase,
      submission: null as null,
      error: "You do not have access to this upload",
    };
  }
  return { profile, supabase, submission, error: null as null };
}

async function nextSubmissionVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  blockId: string,
): Promise<number> {
  const { data } = await supabase
    .from("scanned_upload_files")
    .select("submission_version")
    .eq("submission_id", submissionId)
    .eq("block_id", blockId)
    .order("submission_version", { ascending: false })
    .limit(1);
  const max = Number(data?.[0]?.submission_version ?? 0);
  return Number.isFinite(max) ? max + 1 : 1;
}

export async function listScannedUploadFilesAction(
  submissionId: string,
  blockId: string,
): Promise<ActionResult & { files?: ScannedUploadFileRow[] }> {
  const access = await assertSubmissionAccess(submissionId);
  if (access.error || !access.submission) return { error: access.error };

  const { data, error } = await access.supabase
    .from("scanned_upload_files")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("block_id", blockId)
    .eq("is_active_version", true)
    .order("display_order", { ascending: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { files: [] };
    }
    return { error: error.message };
  }
  return {
    files: (data ?? []).map((row) => mapFile(row as Record<string, unknown>)),
  };
}

export async function listSubmissionScannedUploadFilesAction(
  submissionId: string,
): Promise<ActionResult & { files?: ScannedUploadFileRow[] }> {
  const access = await assertSubmissionAccess(submissionId);
  if (access.error || !access.submission) return { error: access.error };

  const { data, error } = await access.supabase
    .from("scanned_upload_files")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("is_active_version", true)
    .order("block_id", { ascending: true })
    .order("display_order", { ascending: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { files: [] };
    }
    return { error: error.message };
  }
  return {
    files: (data ?? []).map((row) => mapFile(row as Record<string, unknown>)),
  };
}

export type PreparedScannedUpload = {
  fileId: string;
  storagePath: string;
  token: string;
  signedUrl: string;
  submissionVersion: number;
  mimeType: string;
  originalFileName: string;
  fileSize: number;
  displayOrder: number;
};

/**
 * Authorise a direct browser→storage upload. Does not transfer file bytes
 * through the Next.js server action.
 */
export async function prepareScannedUploadAction(input: {
  submissionId: string;
  blockId: string;
  questionId?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  displayOrder?: number;
}): Promise<ActionResult & { prepared?: PreparedScannedUpload }> {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  if (!input.submissionId || !input.blockId) {
    return { error: "Missing submission or block" };
  }
  if (!ALLOWED.has(input.mimeType)) {
    return { error: "This file type is not accepted." };
  }
  if (input.fileSize <= 0) {
    return { error: "Choose a PDF, JPG or PNG file to upload" };
  }
  if (input.fileSize > MAX_BYTES) {
    return { error: "The file is larger than the allowed limit." };
  }

  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("id, student_id, status, assignment_id")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (subError || !submission) {
    return { error: subError?.message ?? "Submission not found" };
  }
  if (submission.student_id !== profile.id) {
    return { error: "You can only upload to your own submission" };
  }
  if (submission.status === "submitted" || submission.status === "late") {
    return {
      error:
        "This homework is locked. Unsubmit first if you need to replace the file.",
    };
  }

  const { data: activeRows } = await supabase
    .from("scanned_upload_files")
    .select("submission_version")
    .eq("submission_id", input.submissionId)
    .eq("block_id", input.blockId)
    .eq("is_active_version", true)
    .limit(1);
  const version =
    activeRows?.[0]?.submission_version != null
      ? Number(activeRows[0].submission_version)
      : await nextSubmissionVersion(
          supabase,
          input.submissionId,
          input.blockId,
        );

  const fileId = crypto.randomUUID();
  const storagePath = buildStudentUploadPath({
    studentId: profile.id,
    assignmentId: submission.assignment_id,
    submissionId: input.submissionId,
    blockId: input.blockId,
    version,
    fileId,
    fileName: input.fileName,
  });

  const { data: signed, error: signError } = await supabase.storage
    .from("student-submissions")
    .createSignedUploadUrl(storagePath);

  if (signError || !signed?.token || !signed.path || !signed.signedUrl) {
    console.error("[scanned-upload] signed upload URL failed", signError);
    return {
      error:
        "The file could not be uploaded to storage. Please retry.",
    };
  }

  return {
    success: "Upload authorised",
    prepared: {
      fileId,
      storagePath: signed.path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      submissionVersion: version,
      mimeType: input.mimeType,
      originalFileName: input.fileName,
      fileSize: input.fileSize,
      displayOrder: Number.isFinite(input.displayOrder)
        ? Number(input.displayOrder)
        : 0,
    },
  };
}

/**
 * Record metadata after the browser has finished the direct storage upload.
 */
export async function confirmScannedUploadAction(input: {
  submissionId: string;
  blockId: string;
  questionId?: string | null;
  fileId: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  displayOrder: number;
  submissionVersion: number;
}): Promise<ActionResult & { file?: ScannedUploadFileRow }> {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("id, student_id, status, assignment_id")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (subError || !submission) {
    return { error: subError?.message ?? "Submission not found" };
  }
  if (submission.student_id !== profile.id) {
    return { error: "You can only upload to your own submission" };
  }
  if (submission.status === "submitted" || submission.status === "late") {
    return { error: "This homework is locked." };
  }

  // Path must belong to this student (storage policy + sanity).
  if (!isStudentOwnedStoragePath(input.storagePath, profile.id)) {
    return {
      error:
        "The upload completed, but the file record could not be saved.",
    };
  }

  const { data: existing } = await supabase
    .from("scanned_upload_files")
    .select("*")
    .eq("id", input.fileId)
    .maybeSingle();
  if (existing) {
    return {
      success: "File already recorded",
      file: mapFile(existing as Record<string, unknown>),
    };
  }

  const { data, error } = await supabase
    .from("scanned_upload_files")
    .insert({
      id: input.fileId,
      submission_id: input.submissionId,
      block_id: input.blockId,
      question_id: input.questionId ?? null,
      submission_version: input.submissionVersion,
      original_storage_path: input.storagePath,
      preview_storage_path: input.storagePath,
      original_file_name: input.originalFileName,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      page_count: input.mimeType === "application/pdf" ? null : 1,
      display_order: input.displayOrder,
      rotation: 0,
      is_active_version: true,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[scanned-upload] metadata insert failed", error);
    if (/does not exist|schema cache/i.test(error.message)) {
      return {
        error:
          "Scanned uploads are not available yet. Run phase_08_scanned_homework_uploads.sql.",
      };
    }
    return {
      error:
        "The upload completed, but the file record could not be saved.",
    };
  }

  // Do not revalidatePath here — it interrupts the client upload UI.
  return {
    success: "File uploaded",
    file: mapFile(data as Record<string, unknown>),
  };
}

/** @deprecated Prefer prepare + direct storage + confirm. Kept for fallback. */
export async function uploadScannedHomeworkFileAction(
  formData: FormData,
): Promise<ActionResult & { file?: ScannedUploadFileRow }> {
  const submissionId = String(formData.get("submission_id") ?? "");
  const blockId = String(formData.get("block_id") ?? "");
  const questionId = String(formData.get("question_id") ?? "") || null;
  const displayOrder = Number(formData.get("display_order") ?? 0);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Choose a PDF, JPG or PNG file to upload" };
  }

  const prepared = await prepareScannedUploadAction({
    submissionId,
    blockId,
    questionId,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    displayOrder,
  });
  if (prepared.error || !prepared.prepared) {
    return { error: prepared.error ?? "Upload could not be authorised" };
  }

  // Fallback path still streams bytes through the server — avoid for large files.
  const supabase = await createClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("student-submissions")
    .uploadToSignedUrl(
      prepared.prepared.storagePath,
      prepared.prepared.token,
      buffer,
      { contentType: file.type },
    );
  if (uploadError) {
    console.error("[scanned-upload] fallback storage upload failed", uploadError);
    return {
      error: "The file could not be uploaded to storage. Please retry.",
    };
  }

  return confirmScannedUploadAction({
    submissionId,
    blockId,
    questionId,
    fileId: prepared.prepared.fileId,
    storagePath: prepared.prepared.storagePath,
    originalFileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    displayOrder: prepared.prepared.displayOrder,
    submissionVersion: prepared.prepared.submissionVersion,
  });
}

export async function updateScannedUploadFileAction(
  fileId: string,
  patch: {
    display_order?: number;
    rotation?: number;
    is_active_version?: boolean;
  },
): Promise<ActionResult & { file?: ScannedUploadFileRow }> {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("scanned_upload_files")
    .select("*, submissions!inner(student_id, status, assignment_id)")
    .eq("id", fileId)
    .maybeSingle();
  if (loadError || !existing) {
    return { error: loadError?.message ?? "File not found" };
  }
  const submission = existing.submissions as {
    student_id: string;
    status: string;
    assignment_id: string;
  };
  if (submission.student_id !== profile.id) {
    return { error: "You can only edit your own uploads" };
  }
  if (submission.status === "submitted" || submission.status === "late") {
    return { error: "This homework is locked. Unsubmit to change files." };
  }

  const { data, error } = await supabase
    .from("scanned_upload_files")
    .update(patch)
    .eq("id", fileId)
    .select("*")
    .single();
  if (error) return { error: error.message };
  return {
    success: "Updated",
    file: mapFile(data as Record<string, unknown>),
  };
}

export async function removeScannedUploadFileAction(
  fileId: string,
): Promise<ActionResult> {
  return updateScannedUploadFileAction(fileId, { is_active_version: false });
}

export async function replaceScannedUploadSetAction(
  submissionId: string,
  blockId: string,
): Promise<ActionResult & { nextVersion?: number }> {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("student_id, status")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission || submission.student_id !== profile.id) {
    return { error: "Unauthorised" };
  }
  if (submission.status === "submitted" || submission.status === "late") {
    return { error: "Unsubmit before replacing files" };
  }
  const nextVersion = await nextSubmissionVersion(
    supabase,
    submissionId,
    blockId,
  );
  const { error } = await supabase
    .from("scanned_upload_files")
    .update({ is_active_version: false })
    .eq("submission_id", submissionId)
    .eq("block_id", blockId)
    .eq("is_active_version", true);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    return { error: error.message };
  }
  return { success: "Ready for replacement upload", nextVersion };
}

/**
 * Background preview normalisation. Must never block the primary upload UX.
 */
export async function finalizeScannedUploadPreviewAction(
  submissionId: string,
  blockId: string,
  options?: { combineImagesToPdf?: boolean },
): Promise<
  ActionResult & {
    previewPath?: string | null;
    pageCount?: number;
    files?: ScannedUploadFileRow[];
  }
> {
  const profile = await requireProfile(["student", "teacher", "admin"]);
  const supabase = await createClient();
  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("id, student_id, status, assignment_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (subError || !submission) {
    return { error: subError?.message ?? "Submission not found" };
  }
  if (profile.role === "student" && submission.student_id !== profile.id) {
    return { error: "You do not have access to this upload" };
  }
  if (
    profile.role === "student" &&
    (submission.status === "submitted" || submission.status === "late")
  ) {
    return {
      error: "This homework is locked. Unsubmit to rebuild the preview.",
    };
  }

  const { data: rows, error } = await supabase
    .from("scanned_upload_files")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("block_id", blockId)
    .eq("is_active_version", true)
    .order("display_order", { ascending: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { files: [] };
    }
    return { error: error.message };
  }

  const files = (rows ?? []).map((row) =>
    mapFile(row as Record<string, unknown>),
  );
  if (!files.length) {
    return { success: "No files to normalise", files: [], previewPath: null };
  }

  const combine = options?.combineImagesToPdf !== false;
  const imageFiles = files.filter((f) => f.mime_type.startsWith("image/"));
  const pdfFiles = files.filter((f) => f.mime_type === "application/pdf");
  const needsCombine =
    combine &&
    (imageFiles.length > 1 ||
      (imageFiles.length >= 1 && pdfFiles.length >= 1) ||
      (imageFiles.length === 1 && imageFiles[0]!.rotation !== 0));

  if (
    !needsCombine &&
    files.length === 1 &&
    files[0]!.mime_type === "application/pdf"
  ) {
    await supabase
      .from("scanned_upload_files")
      .update({ preview_storage_path: files[0]!.original_storage_path })
      .eq("id", files[0]!.id);
    return {
      success: "Preview ready",
      previewPath: files[0]!.original_storage_path,
      pageCount: files[0]!.page_count ?? undefined,
      files,
    };
  }

  if (!needsCombine && imageFiles.length <= 1 && pdfFiles.length === 0) {
    return {
      success: "Preview uses original image pages",
      previewPath:
        files[0]?.preview_storage_path ?? files[0]?.original_storage_path,
      pageCount: files.length,
      files,
    };
  }

  try {
    const sources = [];
    for (const file of files) {
      if (
        file.mime_type !== "application/pdf" &&
        !file.mime_type.startsWith("image/")
      ) {
        continue;
      }
      const { data: blob, error: dlError } = await supabase.storage
        .from("student-submissions")
        .download(file.original_storage_path);
      if (dlError || !blob) {
        return {
          error:
            "The preview is still being prepared. Your original file is safely uploaded.",
          files,
        };
      }
      sources.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: file.mime_type,
        fileName: file.original_file_name,
        rotation: file.rotation,
      });
    }

    if (!sources.length) {
      return {
        error:
          "The preview is still being prepared. Your original file is safely uploaded.",
        files,
      };
    }

    const { pdfBytes, pageCount } = await buildNormalisedMarkingPdf(sources);
    const version = files[0]!.submission_version;
    const previewPath = [
      submission.student_id,
      submission.assignment_id,
      submissionId,
      blockId,
      `v${version}`,
      "marking-preview.pdf",
    ].join("/");
    const { error: upError } = await supabase.storage
      .from("student-submissions")
      .upload(previewPath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upError) {
      console.error("[scanned-upload] preview upload failed", upError);
      return {
        error:
          "The preview is still being prepared. Your original file is safely uploaded.",
        files,
      };
    }

    const ids = files.map((f) => f.id);
    await supabase
      .from("scanned_upload_files")
      .update({
        preview_storage_path: previewPath,
        page_count: pageCount,
      })
      .in("id", ids);

    const refreshed = await listScannedUploadFilesAction(submissionId, blockId);
    return {
      success: "Marking preview PDF created",
      previewPath,
      pageCount,
      files: refreshed.files ?? files,
    };
  } catch (err) {
    console.error("[scanned-upload] preview conversion failed", err);
    return {
      error:
        "The preview is still being prepared. Your original file is safely uploaded.",
      files,
    };
  }
}
