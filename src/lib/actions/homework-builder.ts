"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentCommentDraft, BuilderSection, StudentResponse } from "@/lib/types";
import { evaluateStructuredCompletion } from "@/lib/homework/completion";
import { isStructuredAssignment } from "@/lib/homework/assignment-mode";
import {
  cloneSection,
  flattenStudentBlocks,
  loadTemplateStructure,
  structureToPayload,
} from "@/lib/homework/structure";
import {
  structuredResponseFingerprint,
  structuredUpsertSkipReason,
} from "@/lib/homework/response-protect";
import { structuredResponsesSchema } from "@/lib/validations/homework";
import type { ActionResult } from "@/lib/actions/auth";
import {
  assertSafeSvg,
  assertSafeUpload,
  buildStoragePath,
  type UploadKind,
} from "@/lib/utils/files";

async function assertTeacher() {
  return requireProfile(["teacher", "admin"]);
}

// ── Save structure ────────────────────────────────────────────────────────────

export async function saveHomeworkStructureAction(
  templateId: string,
  sections: BuilderSection[],
  options?: { revalidate?: boolean },
): Promise<ActionResult & { savedAt?: string }> {
  await assertTeacher();
  const supabase = await createClient();

  const payload = structureToPayload(sections);

  const { error } = await supabase.rpc("save_assignment_structure", {
    p_template_id: templateId,
    p_structure: payload,
  });

  if (error) return { error: error.message };

  // Keep dedicated scanned-upload tables aligned with block config JSON.
  await syncScannedUploadTables(supabase, sections);

  // Local-first autosave: never return reloaded structure (would wipe in-progress typing).
  // Client IDs are preserved by the SQL upsert. Do not remount the builder.
  if (options?.revalidate) {
    revalidatePath(`/teacher/assignments`);
  }

  return { success: "Structure saved", savedAt: new Date().toISOString() };
}

async function syncScannedUploadTables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sections: BuilderSection[],
) {
  const blocks = flattenStudentBlocks(sections).filter(
    (b) => b.block_type === "scanned_homework_upload",
  );
  if (!blocks.length) return;

  for (const block of blocks) {
    const config = block.scannedUploadConfig;
    if (!config) continue;
    const settingsPayload = {
      block_id: block._id,
      maximum_files: config.maximum_files,
      maximum_file_size_bytes: config.maximum_file_size_bytes,
      allowed_mime_types: config.allowed_mime_types,
      combine_images_to_pdf: config.combine_images_to_pdf,
      allow_images: config.allow_images,
      allow_pdf: config.allow_pdf,
      allow_docx: config.allow_docx,
      allow_replacement: config.allow_replacement,
      mark_scheme_storage_path: config.mark_scheme_storage_path ?? null,
      mark_scheme_file_name: config.mark_scheme_file_name ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error: settingsError } = await supabase
      .from("scanned_upload_block_settings")
      .upsert(settingsPayload, { onConflict: "block_id" });
    if (settingsError && !/does not exist|schema cache/i.test(settingsError.message)) {
      console.warn("scanned_upload_block_settings sync:", settingsError.message);
      continue;
    }

    const { error: deleteError } = await supabase
      .from("scanned_upload_questions")
      .delete()
      .eq("block_id", block._id);
    if (deleteError && !/does not exist|schema cache/i.test(deleteError.message)) {
      console.warn("scanned_upload_questions clear:", deleteError.message);
      continue;
    }

    if (config.subquestions.length) {
      const rows = config.subquestions.map((q) => ({
        id: q.id,
        block_id: block._id,
        question_label: q.question_label,
        title: q.title,
        description: q.description,
        maximum_mark: q.maximum_mark,
        is_required: q.is_required,
        include_in_total: q.include_in_total,
        marking_guidance: q.marking_guidance,
        display_order: q.display_order,
      }));
      const { error: insertError } = await supabase
        .from("scanned_upload_questions")
        .insert(rows);
      if (insertError && !/does not exist|schema cache/i.test(insertError.message)) {
        console.warn("scanned_upload_questions sync:", insertError.message);
      }
    }
  }
}

// ── Block media uploads (image / video / downloadable) ───────────────────────

export type BlockMediaUploadResult = ActionResult & {
  media?: {
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    resource_id: string | null;
    external_url?: string | null;
  };
};

export async function uploadBlockMediaAction(
  assignmentId: string,
  kind: "image" | "video" | "download",
  formData: FormData,
): Promise<BlockMediaUploadResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, teacher_id, class_id, template_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" };

  const canEdit =
    profile.role === "admin" ||
    assignment.teacher_id === profile.id ||
    Boolean(
      (
        await supabase
          .from("class_teachers")
          .select("id")
          .eq("class_id", assignment.class_id)
          .eq("teacher_id", profile.id)
          .eq("can_create_assignments", true)
          .maybeSingle()
      ).data,
    );
  if (!canEdit) return { error: "Assignment not found" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload" };

  const uploadKind: UploadKind =
    kind === "image"
      ? "block-image"
      : kind === "video"
        ? "block-video"
        : "block-download";

  try {
    const { mime, safeName } = assertSafeUpload(file, uploadKind);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mime === "image/svg+xml" || safeName.toLowerCase().endsWith(".svg")) {
      assertSafeSvg(buffer);
    }

    const path = buildStoragePath(
      profile.id,
      assignmentId,
      "blocks",
      kind,
      `${crypto.randomUUID()}-${safeName}`,
    );

    const { error: uploadError } = await supabase.storage
      .from("assignment-resources")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (uploadError) return { error: uploadError.message };

    const resourceKind =
      kind === "image" ? "image" : kind === "video" ? "video" : "other";

    const { data: resource, error } = await supabase
      .from("assignment_resources")
      .insert({
        assignment_id: assignmentId,
        file_name: safeName,
        storage_path: path,
        file_type: mime,
        file_size: file.size,
        mime_type: mime,
        file_size_bytes: file.size,
        title: safeName,
        resource_kind: resourceKind,
        allow_download: true,
        visibility: "student",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // Storage succeeded; still return media even if resource row insert fails
      // (older DBs may lack optional columns).
      return {
        success: "File uploaded",
        media: {
          storage_path: path,
          file_name: safeName,
          mime_type: mime,
          file_size: file.size,
          resource_id: null,
        },
      };
    }

    return {
      success: "File uploaded",
      media: {
        storage_path: path,
        file_name: safeName,
        mime_type: mime,
        file_size: file.size,
        resource_id: resource?.id ?? null,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

// ── Resources and mark schemes ───────────────────────────────────────────────

export async function uploadMarkSchemeAction(
  templateId: string,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a PDF to upload" };

  try {
    const { mime, safeName } = assertSafeUpload(file, "assignment-resource");
    if (mime !== "application/pdf" && !safeName.toLowerCase().endsWith(".pdf")) {
      return { error: "Mark schemes must be PDF files" };
    }

    const path = buildStoragePath(
      profile.id,
      templateId,
      "mark-schemes",
      `${crypto.randomUUID()}-${safeName}`,
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("assignment-resources")
      .upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) return { error: uploadError.message };

    const { error } = await supabase.from("assignment_mark_schemes").insert({
      template_id: templateId,
      title: safeName.replace(/\.pdf$/i, ""),
      storage_path: path,
      file_name: safeName,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      created_by: profile.id,
    });
    if (error) return { error: error.message };

    return { success: "Mark scheme uploaded" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

// ── Assignment-specific feedback comments ───────────────────────────────────

export async function saveAssignmentCommentsAction(
  templateId: string,
  comments: AssignmentCommentDraft[],
): Promise<ActionResult & { savedAt?: string }> {
  await assertTeacher();
  const supabase = await createClient();

  // Validate linked questions exist before writing anything.
  const questionIds = [
    ...new Set(
      comments
        .flatMap((c) => [
          c.linked_question_id,
          ...(c.linked_question_ids ?? []),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let validQuestionIds = new Set<string>();
  if (questionIds.length) {
    const { data: questions } = await supabase
      .from("assignment_questions")
      .select("id")
      .in("id", questionIds);
    validQuestionIds = new Set((questions ?? []).map((q) => q.id as string));
  }

  // Prefer transactional RPC when available.
  const rows = comments.map((comment, index) => {
    const linkedIds = [
      ...new Set(
        [comment.linked_question_id, ...(comment.linked_question_ids ?? [])]
          .filter((id): id is string => Boolean(id))
          .filter((id) => validQuestionIds.has(id)),
      ),
    ];
    return {
      id: comment._id,
      template_id: templateId,
      short_label: comment.short_label.trim() || "Untitled comment",
      full_comment: comment.full_comment ?? "",
      category: comment.category || null,
      linked_question_id: linkedIds[0] ?? null,
      linked_question_ids: linkedIds,
      linked_section_id: comment.linked_section_id || null,
      mark_range_min: comment.mark_range_min ?? null,
      mark_range_max: comment.mark_range_max ?? null,
      is_active: comment.is_active,
      sort_order: index,
      available_for_drag_drop: comment.available_for_drag_drop,
      available_for_overall: comment.available_for_overall,
      available_for_question: comment.available_for_question,
      available_for_annotation: comment.available_for_annotation ?? false,
      assessment_objective: comment.assessment_objective || null,
    };
  });

  const { error: rpcError } = await supabase.rpc("save_assignment_comments", {
    p_template_id: templateId,
    p_comments: rows,
  });

  if (!rpcError) {
    return {
      success: "Feedback comments saved",
      savedAt: new Date().toISOString(),
    };
  }

  const rpcMissing = /could not find the function|schema cache/i.test(
    rpcError.message ?? "",
  );
  if (!rpcMissing) return { error: rpcError.message };

  // Fallback: upsert first, then delete orphans (never delete-before-upsert).
  if (rows.length > 0) {
    let { error: upsertError } = await supabase
      .from("assignment_comments")
      .upsert(rows, { onConflict: "id" });

    // Older DBs may not have the newer columns yet — retry with legacy shape.
    if (
      upsertError &&
      /linked_question_ids|linked_section_id|available_for_annotation|assessment_objective|column/i.test(
        upsertError.message ?? "",
      )
    ) {
      const legacyRows = rows.map((row) => ({
        id: row.id,
        template_id: row.template_id,
        short_label: row.short_label,
        full_comment: row.full_comment,
        category: row.category,
        linked_question_id: row.linked_question_id,
        mark_range_min: row.mark_range_min,
        mark_range_max: row.mark_range_max,
        is_active: row.is_active,
        sort_order: row.sort_order,
        available_for_drag_drop: row.available_for_drag_drop,
        available_for_overall: row.available_for_overall,
        available_for_question: row.available_for_question,
      }));
      const retry = await supabase
        .from("assignment_comments")
        .upsert(legacyRows, { onConflict: "id" });
      upsertError = retry.error;
    }

    if (upsertError) return { error: upsertError.message };
  }

  const keepIds = rows.map((r) => r.id);
  let deleteQuery = supabase
    .from("assignment_comments")
    .delete()
    .eq("template_id", templateId);
  if (keepIds.length > 0) {
    deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return { error: deleteError.message };

  return { success: "Feedback comments saved", savedAt: new Date().toISOString() };
}

export async function saveCommentBankLinksAction(
  templateId: string,
  commentBankIds: string[],
): Promise<ActionResult> {
  await assertTeacher();
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("assignment_comment_bank_links")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) return { error: deleteError.message };

  const uniqueIds = [...new Set(commentBankIds)].filter(Boolean);
  if (uniqueIds.length > 0) {
    const { error: insertError } = await supabase
      .from("assignment_comment_bank_links")
      .insert(uniqueIds.map((comment_bank_id) => ({ template_id: templateId, comment_bank_id })));
    if (insertError) return { error: insertError.message };
  }

  return { success: "Comment bank links saved" };
}

// ── Copy section from another template ───────────────────────────────────────

export async function copySectionFromTemplateAction(
  sourceTemplateId: string,
  sourceSectionId: string,
  targetTemplateId: string,
): Promise<ActionResult & { section?: BuilderSection }> {
  await assertTeacher();
  const supabase = await createClient();

  const [{ data: sourceTemplate }, { data: targetTemplate }] =
    await Promise.all([
      supabase
        .from("assignment_templates")
        .select("id, created_by")
        .eq("id", sourceTemplateId)
        .maybeSingle(),
      supabase
        .from("assignment_templates")
        .select("id, created_by")
        .eq("id", targetTemplateId)
        .maybeSingle(),
    ]);

  if (!sourceTemplate) return { error: "Source template not found" };
  if (!targetTemplate) return { error: "Target template not found" };

  const { loadTemplateStructure } = await import("@/lib/homework/structure");
  const sections = await loadTemplateStructure(supabase, sourceTemplateId);
  const found = sections.find((s) => s._id === sourceSectionId);

  if (!found) return { error: "Section not found in source template" };

  return { success: "Section copied", section: cloneSection(found) };
}

// ── Teacher templates list (for copy-from modal) ──────────────────────────────

export async function listMyTemplatesAction(): Promise<
  ActionResult & { templates?: Array<{ id: string; title: string }> }
> {
  const profile = await assertTeacher();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assignment_templates")
    .select("id, title")
    .eq("created_by", profile.id)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { templates: data ?? [] };
}

export async function listTemplateSectionsAction(
  templateId: string,
): Promise<ActionResult & { sections?: Array<{ id: string; title: string }> }> {
  await assertTeacher();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assignment_sections")
    .select("id, title, sort_order")
    .eq("template_id", templateId)
    .is("parent_section_id", null)
    .order("sort_order");

  if (error) return { error: error.message };
  return { sections: data ?? [] };
}

// ── Student structured responses ─────────────────────────────────────────────

export interface StructuredResponseInput {
  question_id: string;
  text_value?: string | null;
  numeric_value?: number | null;
  boolean_value?: boolean | null;
  json_value?: unknown;
  client_version?: number;
  cells?: Array<{
    row_index: number;
    col_index: number;
    text_value?: string | null;
    numeric_value?: number | null;
    boolean_value?: boolean | null;
  }>;
}

async function assertStudentCanAccessAssignment(assignmentId: string) {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, class_id, status, release_at")
    .eq("id", assignmentId)
    .eq("status", "published")
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" as const };

  if (assignment.release_at && new Date(assignment.release_at).getTime() > Date.now()) {
    return { error: "This homework is not available yet" as const };
  }

  const { data: membership } = await supabase
    .from("class_members")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!membership) return { error: "You are not in this class" as const };

  return { profile, supabase, assignment };
}

export async function saveStudentStructuredResponsesAction(
  assignmentId: string,
  responses: StructuredResponseInput[],
): Promise<
  ActionResult & {
    savedCount?: number;
    submissionId?: string;
    savedAt?: string;
  }
> {
  const access = await assertStudentCanAccessAssignment(assignmentId);
  if ("error" in access && access.error) return { error: access.error };
  const { profile, supabase } = access as Awaited<
    ReturnType<typeof assertStudentCanAccessAssignment>
  > & { profile: { id: string }; supabase: Awaited<ReturnType<typeof createClient>> };

  let { data: submission } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (!submission) {
    const { data: created, error: createError } = await supabase
      .from("submissions")
      .insert({ assignment_id: assignmentId, student_id: profile.id, status: "draft" })
      .select("id, status")
      .single();
    if (createError || !created) {
      return { error: createError?.message ?? "Could not create submission" };
    }
    submission = created;
  }

  if (!["draft", "returned"].includes(submission.status)) {
    return {
      error: `Submission is locked (status: ${submission.status}). Unsubmit to continue editing.`,
    };
  }

  if (responses.length === 0) {
    // Legitimate when the student has not entered answers yet.
    return {
      success: "Nothing to save",
      savedAt: new Date().toISOString(),
      submissionId: submission.id,
      savedCount: 0,
    };
  }

  const parsed = structuredResponsesSchema.safeParse(responses);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid responses" };
  }

  const questionIds = parsed.data.map((r) => r.question_id);
  let existingRows: Array<Record<string, unknown>> | null = null;
  if (questionIds.length) {
    const withVersion = await supabase
      .from("student_responses")
      .select(
        "id, question_id, text_value, numeric_value, boolean_value, json_value, file_name, storage_path, client_version, response_cells(text_value, numeric_value, boolean_value)",
      )
      .eq("submission_id", submission.id)
      .in("question_id", questionIds);
    if (withVersion.error && /client_version/i.test(withVersion.error.message)) {
      const fallback = await supabase
        .from("student_responses")
        .select(
          "id, question_id, text_value, numeric_value, boolean_value, json_value, file_name, storage_path, response_cells(text_value, numeric_value, boolean_value)",
        )
        .eq("submission_id", submission.id)
        .in("question_id", questionIds);
      existingRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
    } else {
      existingRows = (withVersion.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  const existingByQuestion = new Map(
    (existingRows ?? []).map((row) => [String(row.question_id), row]),
  );

  const errors: string[] = [];
  let savedCount = 0;

  for (const resp of parsed.data) {
    const existing = existingByQuestion.get(resp.question_id);
    const incomingEmpty = isEmptyStructuredPayload(resp);
    const existingPopulated = existing
      ? hasPopulatedStructuredRow(existing)
      : false;
    const existingVersion = Number(existing?.client_version ?? 0);
    const incomingVersion =
      typeof resp.client_version === "number" ? resp.client_version : null;

    const skipReason = structuredUpsertSkipReason({
      incomingEmpty,
      existingPopulated,
      incomingVersion,
      existingVersion,
    });

    if (skipReason === "stale_version") {
      const existingFp = structuredResponseFingerprint({
        text_value: (existing?.text_value as string | null) ?? null,
        numeric_value: (existing?.numeric_value as number | null) ?? null,
        boolean_value: (existing?.boolean_value as boolean | null) ?? null,
        json_value: existing?.json_value,
        file_name: (existing?.file_name as string | null) ?? null,
        storage_path: (existing?.storage_path as string | null) ?? null,
        cells: Array.isArray(existing?.response_cells)
          ? (existing.response_cells as Array<{
              row_index: number;
              col_index: number;
              text_value?: string | null;
              numeric_value?: number | null;
              boolean_value?: boolean | null;
            }>)
          : [],
      });
      const incomingFp = structuredResponseFingerprint({
        text_value: resp.text_value,
        numeric_value: resp.numeric_value,
        boolean_value: resp.boolean_value,
        json_value: resp.json_value,
        cells: resp.cells,
      });
      if (existingFp !== incomingFp) {
        errors.push(
          "A newer answer is already saved for one or more questions. Reload the page and try again — stale autosave was rejected.",
        );
        if (process.env.NODE_ENV !== "production") {
          console.info("[student-response-save] stale_version_rejected", {
            submissionId: submission.id,
            questionId: resp.question_id,
            incomingVersion,
            existingVersion,
          });
        }
      }
      // Identical content with an older version: safe no-op.
      continue;
    }

    if (skipReason === "empty_overwrite") {
      continue;
    }

    const upsertRow: Record<string, unknown> = {
      submission_id: submission.id,
      question_id: resp.question_id,
      text_value: resp.text_value ?? null,
      numeric_value: resp.numeric_value ?? null,
      boolean_value: resp.boolean_value ?? null,
      json_value: resp.json_value ?? null,
    };
    if (incomingVersion != null) {
      upsertRow.client_version = incomingVersion;
    }

    const responseKind = incomingEmpty
      ? "empty"
      : resp.json_value != null
        ? "mcq_or_json"
        : resp.numeric_value != null
          ? "numeric"
          : resp.boolean_value != null
            ? "boolean"
            : resp.cells?.length
              ? "table"
              : "text";

    if (process.env.NODE_ENV !== "production") {
      console.info("[student-response-save]", {
        submissionId: submission.id,
        questionId: resp.question_id,
        responseType: responseKind,
        operation: existing ? "update" : "insert",
        clientVersion: incomingVersion,
        timestamp: new Date().toISOString(),
        // Do not log answer text.
      });
    }

    let { data: upserted, error: upsertError } = await supabase
      .from("student_responses")
      .upsert(upsertRow, { onConflict: "submission_id,question_id" })
      .select("id")
      .single();

    // Pre-migration compatibility: retry without client_version column.
    if (
      upsertError &&
      /client_version/i.test(upsertError.message) &&
      "client_version" in upsertRow
    ) {
      delete upsertRow.client_version;
      ({ data: upserted, error: upsertError } = await supabase
        .from("student_responses")
        .upsert(upsertRow, { onConflict: "submission_id,question_id" })
        .select("id")
        .single());
    }

    if (upsertError) {
      errors.push(
        `Question ${resp.question_id.slice(0, 8)}… upsert failed: ${upsertError.message}`,
      );
      continue;
    }

    savedCount += 1;

    if (resp.cells?.length && upserted) {
      const cellRows = resp.cells.map((c) => ({
        student_response_id: upserted.id,
        row_index: c.row_index,
        col_index: c.col_index,
        text_value: c.text_value ?? null,
        numeric_value: c.numeric_value ?? null,
        boolean_value: c.boolean_value ?? null,
      }));

      const { error: cellError } = await supabase
        .from("response_cells")
        .upsert(cellRows, { onConflict: "student_response_id,row_index,col_index" });

      if (cellError) {
        errors.push(
          `Question ${resp.question_id.slice(0, 8)}… cell save failed: ${cellError.message}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return {
      error: errors[0],
      submissionId: submission.id,
      savedCount,
    };
  }

  // Local-first: do not revalidatePath on autosave (prevents remount / text loss).
  return {
    success: "Responses saved",
    savedAt: new Date().toISOString(),
    submissionId: submission.id,
    savedCount,
  } as ActionResult & {
    savedAt: string;
    submissionId: string;
    savedCount: number;
  };
}

export async function submitStructuredHomeworkAction(
  assignmentId: string,
  responses: StructuredResponseInput[] = [],
): Promise<ActionResult & { submissionId?: string }> {
  // Final sync of flushed answers. Empty payloads never wipe existing rows.
  if (responses.length > 0) {
    const saveResult = await saveStudentStructuredResponsesAction(
      assignmentId,
      responses,
    );
    if (saveResult.error) return saveResult;
  }

  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, due_at, class_id, template_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { error: "Assignment not found" };

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (!submission || !["draft", "returned"].includes(submission.status)) {
    return { error: "Submission is locked" };
  }

  const submissionIdBefore = submission.id;

  const { count: responseCountBefore } = await supabase
    .from("student_responses")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);

  // Always reload authoritative rows with no client cache assumptions.
  const { data: storedFresh, error: reloadError } = await supabase
    .from("student_responses")
    .select(
      "id, question_id, text_value, numeric_value, boolean_value, json_value, file_name, storage_path, client_version, updated_at, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
    )
    .eq("submission_id", submission.id);

  if (reloadError) {
    return {
      error: `Could not reload saved answers before submit: ${reloadError.message}`,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[submit] before", {
      submissionId: submission.id,
      status: submission.status,
      responseCount: responseCountBefore ?? 0,
      incomingResponseCount: responses.length,
      reloadedResponseCount: storedFresh?.length ?? 0,
    });
  }

  // Confirm flushed client payload matches DB before status transition.
  if (responses.length > 0) {
    const byQuestion = new Map(
      (storedFresh ?? []).map((row) => [String(row.question_id), row]),
    );
    for (const resp of responses) {
      if (isEmptyStructuredPayload(resp)) continue;
      const row = byQuestion.get(resp.question_id);
      if (!row) {
        return {
          error:
            "Submit aborted: a required answer was not found in the database after save. Reload and try again.",
        };
      }
      const dbFp = structuredResponseFingerprint({
        text_value: row.text_value as string | null,
        numeric_value: row.numeric_value as number | null,
        boolean_value: row.boolean_value as boolean | null,
        json_value: row.json_value,
        file_name: row.file_name as string | null,
        storage_path: row.storage_path as string | null,
        cells: Array.isArray(row.response_cells)
          ? (row.response_cells as Array<{
              row_index: number;
              col_index: number;
              text_value?: string | null;
              numeric_value?: number | null;
              boolean_value?: boolean | null;
            }>)
          : [],
      });
      const clientFp = structuredResponseFingerprint({
        text_value: resp.text_value,
        numeric_value: resp.numeric_value,
        boolean_value: resp.boolean_value,
        json_value: resp.json_value,
        cells: resp.cells,
      });
      if (dbFp !== clientFp) {
        return {
          error:
            "Submit aborted: saved answers do not match what you edited. Reload the page, confirm your answers, and submit again.",
        };
      }
    }
  }

  // Completion is calculated from structured responses, never legacy written_response.
  if (assignment.template_id) {
    try {
      const sections = await loadTemplateStructure(supabase, assignment.template_id);
      if (isStructuredAssignment(sections)) {
        const snapshots = (storedFresh ?? []).map((row) => ({
          question_id: row.question_id as string,
          text_value: row.text_value as string | null,
          numeric_value: row.numeric_value as number | null,
          boolean_value: row.boolean_value as boolean | null,
          json_value: row.json_value,
          file_name: row.file_name as string | null,
          storage_path: row.storage_path as string | null,
          cells: Array.isArray(row.response_cells)
            ? (row.response_cells as Array<{
                row_index: number;
                col_index: number;
                text_value: string | null;
                numeric_value: number | null;
                boolean_value: boolean | null;
              }>)
            : [],
        }));

        const completion = evaluateStructuredCompletion(sections, snapshots);
        if (!completion.isComplete) {
          const missing = completion.missingRequired
            .slice(0, 3)
            .map((q) => q.label)
            .join("; ");
          return {
            error: missing
              ? `Complete required questions before submitting (${missing})`
              : "Complete required questions before submitting",
          };
        }
      }
    } catch {
      // If structure cannot be loaded, still allow submit of saved responses.
    }
  }

  const late =
    assignment.due_at != null &&
    new Date(assignment.due_at).getTime() < Date.now();
  const nextStatus = late ? "late" : "submitted";
  const submittedAt = new Date().toISOString();

  // Prefer transactional RPC (status-only; never touches response rows).
  const { data: rpcRow, error: rpcError } = await supabase.rpc(
    "submit_structured_homework",
    {
      p_assignment_id: assignmentId,
      p_status: nextStatus,
      p_submitted_at: submittedAt,
    },
  );

  if (rpcError) {
    const rpcMissing = /could not find the function|schema cache/i.test(
      rpcError.message ?? "",
    );
    if (!rpcMissing) return { error: rpcError.message };

    // Legacy fallback: older submit_student_homework RPC / direct update.
    const { error: legacyRpcError } = await supabase.rpc(
      "submit_student_homework",
      {
        p_assignment_id: assignmentId,
        p_status: nextStatus,
        p_submitted_at: submittedAt,
      },
    );
    if (legacyRpcError) {
      const legacyMissing = /could not find the function|schema cache/i.test(
        legacyRpcError.message ?? "",
      );
      const enumCastBug =
        /submission_status|expression is of type text/i.test(
          legacyRpcError.message ?? "",
        );
      if (!legacyMissing && !enumCastBug) {
        return { error: legacyRpcError.message };
      }

      const { error } = await supabase
        .from("submissions")
        .update({
          status: nextStatus,
          submitted_at: submittedAt,
        })
        .eq("id", submission.id)
        .eq("student_id", profile.id)
        .in("status", ["draft", "returned"]);
      if (error) return { error: error.message };
    }
  }

  const { data: confirmed } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", submission.id)
    .maybeSingle();
  if (!confirmed || !["submitted", "late"].includes(confirmed.status)) {
    return { error: "Could not finalise submission status" };
  }
  if (confirmed.id !== submissionIdBefore) {
    return { error: "Submission ID changed unexpectedly during submit" };
  }

  const { count: responseCountAfter } = await supabase
    .from("student_responses")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);

  if ((responseCountAfter ?? 0) < (responseCountBefore ?? 0)) {
    return {
      error:
        "Submit aborted: response rows decreased unexpectedly. Contact support.",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[submit] after", {
      submissionId: confirmed.id,
      submissionIdBefore,
      status: confirmed.status,
      responseCountBefore: responseCountBefore ?? 0,
      responseCountAfter: responseCountAfter ?? 0,
      rpcReturnedId: rpcRow?.id ?? null,
    });
  }

  const { data: classTeachers } = await supabase
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", assignment.class_id)
    .eq("can_mark_submissions", true);

  if (classTeachers?.length) {
    await supabase.from("notifications").insert(
      classTeachers.map((ct) => ({
        user_id: ct.teacher_id,
        type: "homework_submitted" as const,
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${assignment.title}`,
        link_path: `/teacher/marking/${submission.id}`,
      })),
    );
  } else {
    const { data: classRow } = await supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", assignment.class_id)
      .maybeSingle();
    if (classRow?.teacher_id) {
      await supabase.from("notifications").insert({
        user_id: classRow.teacher_id,
        type: "homework_submitted",
        title: "Homework submitted",
        body: `${profile.display_name} submitted ${assignment.title}`,
        link_path: `/teacher/marking/${submission.id}`,
      });
    }
  }

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath(`/student/homework/assignments/${assignmentId}`);
  revalidatePath("/student/homework");
  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/marking");
  revalidatePath(`/teacher/marking/submissions/${submission.id}`);
  revalidatePath("/teacher/dashboard");
  return {
    success: late
      ? "Submitted (marked late). Your teacher can now review it."
      : "Homework submitted successfully.",
    submissionId: submission.id,
  };
}

/** Restore editing without deleting any structured answers. */
export async function unsubmitStructuredHomeworkAction(
  assignmentId: string,
): Promise<ActionResult & { submissionId?: string }> {
  const profile = await requireProfile(["student"]);
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (!submission) return { error: "Submission not found" };
  if (!["submitted", "late"].includes(submission.status)) {
    return {
      error:
        "Only submitted homework can be unsubmitted. Marked or returned work cannot be reopened here.",
    };
  }

  const { count: responseCountBefore } = await supabase
    .from("student_responses")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);

  if (process.env.NODE_ENV !== "production") {
    console.info("[unsubmit] before", {
      submissionId: submission.id,
      status: submission.status,
      responseCount: responseCountBefore ?? 0,
    });
  }

  const { data: rpcRow, error: rpcError } = await supabase.rpc(
    "unsubmit_structured_homework",
    { p_assignment_id: assignmentId },
  );

  if (rpcError) {
    const rpcMissing = /could not find the function|schema cache/i.test(
      rpcError.message ?? "",
    );
    if (!rpcMissing) return { error: rpcError.message };

    // Legacy RPC name (must be security definer after migration).
    const { error: legacyError } = await supabase.rpc(
      "unsubmit_student_homework",
      { p_assignment_id: assignmentId },
    );
    if (legacyError) {
      const legacyMissing = /could not find the function|schema cache/i.test(
        legacyError.message ?? "",
      );
      if (!legacyMissing) return { error: legacyError.message };
      return {
        error:
          "Unsubmit is not available yet. Ask your administrator to run the latest Phase 6 submission migration.",
      };
    }
  }

  const { data: confirmed } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", submission.id)
    .maybeSingle();
  if (!confirmed || confirmed.status !== "draft") {
    return {
      error:
        "Could not unsubmit this homework. It may already be marked, or unsubmit is not permitted.",
    };
  }
  if (confirmed.id !== submission.id) {
    return { error: "Submission ID changed unexpectedly during unsubmit" };
  }

  const { count: responseCountAfter } = await supabase
    .from("student_responses")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);

  if ((responseCountAfter ?? 0) < (responseCountBefore ?? 0)) {
    return {
      error:
        "Unsubmit aborted: response rows decreased unexpectedly. Contact support.",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[unsubmit] after", {
      submissionId: confirmed.id,
      status: confirmed.status,
      responseCountBefore: responseCountBefore ?? 0,
      responseCountAfter: responseCountAfter ?? 0,
      rpcReturnedId: rpcRow?.id ?? null,
    });
  }

  revalidatePath(`/student/homework/${assignmentId}`);
  revalidatePath(`/student/homework/assignments/${assignmentId}`);
  revalidatePath("/student/homework");
  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/marking");
  revalidatePath(`/teacher/marking/submissions/${submission.id}`);
  return {
    success: "Homework unsubmitted. You can continue editing.",
    submissionId: submission.id,
  };
}

// ── Load student's existing responses ────────────────────────────────────────

export async function loadStudentResponsesAction(
  submissionId: string,
): Promise<
  ActionResult & {
    responses?: Array<
      StudentResponse & {
        cells?: Array<{
          row_index: number;
          col_index: number;
          text_value: string | null;
          numeric_value: number | null;
          boolean_value: string | boolean | null;
        }>;
      }
    >;
  }
> {
  const profile = await requireProfile(["student", "teacher", "admin"]);
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, student_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) return { error: "Submission not found" };
  if (profile.role === "student" && submission.student_id !== profile.id) {
    return { error: "Not authorised" };
  }

  const { data, error } = await supabase
    .from("student_responses")
    .select(
      "*, response_cells(row_index, col_index, text_value, numeric_value, boolean_value)",
    )
    .eq("submission_id", submissionId);

  if (error) return { error: error.message };

  const responses = (data ?? []).map((r) => ({
    ...r,
    cells: Array.isArray(r.response_cells) ? r.response_cells : [],
  }));

  return { responses };
}

function isEmptyStructuredPayload(resp: StructuredResponseInput): boolean {
  const hasText = Boolean(resp.text_value?.trim());
  const hasNumeric =
    resp.numeric_value != null && !Number.isNaN(Number(resp.numeric_value));
  const hasBool = resp.boolean_value != null;
  let hasJson = false;
  if (resp.json_value != null && typeof resp.json_value === "object") {
    const json = resp.json_value as { kind?: string; option_ids?: unknown[] };
    if (json.kind === "mcq") {
      hasJson = Array.isArray(json.option_ids) && json.option_ids.length > 0;
    } else {
      hasJson = true;
    }
  }
  const hasCells = Boolean(
    resp.cells?.some(
      (c) =>
        Boolean(c.text_value?.trim()) ||
        c.numeric_value != null ||
        c.boolean_value != null,
    ),
  );
  return !hasText && !hasNumeric && !hasBool && !hasJson && !hasCells;
}

function hasPopulatedStructuredRow(row: Record<string, unknown>): boolean {
  if (typeof row.text_value === "string" && row.text_value.trim()) return true;
  if (row.numeric_value != null && !Number.isNaN(Number(row.numeric_value))) {
    return true;
  }
  if (row.boolean_value != null) return true;
  if (row.file_name || row.storage_path) return true;
  if (row.json_value != null) {
    const json = row.json_value as { kind?: string; option_ids?: unknown[] };
    if (json.kind === "mcq" && Array.isArray(json.option_ids) && json.option_ids.length) {
      return true;
    }
    if (typeof row.json_value === "object") return true;
  }
  const cells = row.response_cells;
  if (Array.isArray(cells)) {
    if (
      cells.some((c) => {
        const cell = c as Record<string, unknown>;
        if (typeof cell.text_value === "string" && cell.text_value.trim()) {
          return true;
        }
        if (
          cell.numeric_value != null &&
          !Number.isNaN(Number(cell.numeric_value))
        ) {
          return true;
        }
        return cell.boolean_value != null;
      })
    ) {
      return true;
    }
  }
  return false;
}
