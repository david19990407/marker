"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { buildNormalisedMarkingPdf } from "@/lib/homework/scanned-upload-preview";
import type { ActionResult } from "@/lib/actions/auth";

const MAX_BYTES = 20 * 1024 * 1024;
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
  roles: Array<"student" | "teacher" | "admin"> = ["student", "teacher", "admin"],
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

/** All active scanned uploads for a submission (teacher marking). */
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

export async function uploadScannedHomeworkFileAction(
  formData: FormData,
): Promise<ActionResult & { file?: ScannedUploadFileRow }> {
  const profile = await requireProfile(["student"]);
  const submissionId = String(formData.get("submission_id") ?? "");
  const blockId = String(formData.get("block_id") ?? "");
  const questionId = String(formData.get("question_id") ?? "") || null;
  const displayOrder = Number(formData.get("display_order") ?? 0);
  const file = formData.get("file");

  if (!submissionId || !blockId) {
    return { error: "Missing submission or block" };
  }
  if (!(file instanceof File)) {
    return { error: "Choose a PDF, JPG or PNG file to upload" };
  }
  if (!ALLOWED.has(file.type)) {
    return { error: "File type not allowed. Use PDF, JPG or PNG." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the maximum size of 20MB" };
  }

  const supabase = await createClient();
  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("id, student_id, status, assignment_id")
    .eq("id", submissionId)
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
    .eq("submission_id", submissionId)
    .eq("block_id", blockId)
    .eq("is_active_version", true)
    .limit(1);
  const version =
    activeRows?.[0]?.submission_version != null
      ? Number(activeRows[0].submission_version)
      : await nextSubmissionVersion(supabase, submissionId, blockId);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${submission.assignment_id}/${profile.id}/${blockId}/v${version}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("student-submissions")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { data, error } = await supabase
    .from("scanned_upload_files")
    .insert({
      submission_id: submissionId,
      block_id: blockId,
      question_id: questionId,
      submission_version: version,
      original_storage_path: path,
      preview_storage_path: path,
      original_file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      page_count: file.type === "application/pdf" ? null : 1,
      display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
      rotation: 0,
      is_active_version: true,
      created_by: profile.id,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("student-submissions").remove([path]);
    if (/does not exist|schema cache/i.test(error.message)) {
      return {
        error:
          "Scanned uploads are not available yet. Run phase_08_scanned_homework_uploads.sql.",
      };
    }
    return { error: error.message };
  }

  revalidatePath(`/student/homework/assignments/${submission.assignment_id}`);
  return {
    success: "File uploaded",
    file: mapFile(data as Record<string, unknown>),
  };
}

export async function updateScannedUploadFileAction(
  fileId: string,
  patch: { display_order?: number; rotation?: number; is_active_version?: boolean },
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
  revalidatePath(`/student/homework/assignments/${submission.assignment_id}`);
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

/**
 * Deactivate all active files for a block before replacing after unsubmit.
 * Increments the submission version so the previous set cannot reappear as active.
 */
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
  const nextVersion = await nextSubmissionVersion(supabase, submissionId, blockId);
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
 * Build a stable marking preview PDF from ordered active originals.
 * Keeps originals unchanged; writes a separate preview object.
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
    return { error: "This homework is locked. Unsubmit to rebuild the preview." };
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

  const files = (rows ?? []).map((row) => mapFile(row as Record<string, unknown>));
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

  if (!needsCombine && files.length === 1 && files[0]!.mime_type === "application/pdf") {
    // Single PDF: preview is the original.
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
      previewPath: files[0]?.preview_storage_path ?? files[0]?.original_storage_path,
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
        // DOCX and unsupported types keep original only.
        continue;
      }
      const { data: blob, error: dlError } = await supabase.storage
        .from("student-submissions")
        .download(file.original_storage_path);
      if (dlError || !blob) {
        return {
          error:
            dlError?.message ??
            `Could not read “${file.original_file_name}” for preview. Original file is preserved — retry conversion.`,
        };
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      sources.push({
        bytes: buffer,
        mimeType: file.mime_type,
        fileName: file.original_file_name,
        rotation: file.rotation,
      });
    }

    if (!sources.length) {
      return {
        error:
          "No convertible pages found for preview. Original uploads are preserved.",
        files,
      };
    }

    const { pdfBytes, pageCount } = await buildNormalisedMarkingPdf(sources);
    const version = files[0]!.submission_version;
    const previewPath = `${submission.assignment_id}/${submission.student_id}/${blockId}/v${version}/marking-preview.pdf`;
    const { error: upError } = await supabase.storage
      .from("student-submissions")
      .upload(previewPath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upError) {
      return {
        error: `Preview conversion failed: ${upError.message}. Original uploads are preserved.`,
        files,
      };
    }

    const ids = files.map((f) => f.id);
    const { error: updateError } = await supabase
      .from("scanned_upload_files")
      .update({
        preview_storage_path: previewPath,
        page_count: pageCount,
      })
      .in("id", ids);
    if (updateError) {
      return { error: updateError.message, files };
    }

    const refreshed = await listScannedUploadFilesAction(submissionId, blockId);
    revalidatePath(`/student/homework/assignments/${submission.assignment_id}`);
    return {
      success: "Marking preview PDF created",
      previewPath,
      pageCount,
      files: refreshed.files ?? files,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `${err.message} Original uploads are preserved — retry conversion.`
          : "Preview conversion failed. Original uploads are preserved.",
      files,
    };
  }
}
