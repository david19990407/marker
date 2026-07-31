"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/supabase/env";
import { requireProfile } from "@/lib/auth/get-profile";
import {
  createClassSchema,
  createUserSchema,
  updateUserSchema,
} from "@/lib/validations/admin";
import { generateJoinCode } from "@/lib/utils/join-code";
import { parseCsv, type ParsedCsvRow } from "@/lib/utils/csv";
import type { ActionResult } from "@/lib/actions/auth";

async function assertAdmin() {
  return requireProfile(["admin"]);
}

export async function createUserAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();

  const classIds = formData.getAll("class_ids").map(String).filter(Boolean);
  const parsed = createUserSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    role: formData.get("role"),
    year_group: formData.get("year_group") || null,
    class_ids: classIds,
    send_invite: formData.get("send_invite") !== "false",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid user data" };
  }

  const data = parsed.data;
  if (data.role === "student" && !data.year_group) {
    return { error: "Year group is required for students" };
  }

  const admin = createAdminClient();
  const displayName = `${data.first_name} ${data.last_name}`.trim();

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
    data.email,
    {
      data: {
        first_name: data.first_name,
        last_name: data.last_name,
        display_name: displayName,
        role: data.role,
        year_group: data.year_group ?? "",
      },
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  );

  if (error || !invited.user) {
    return { error: error?.message ?? "Failed to invite user" };
  }

  // Ensure profile fields are correct (trigger may have run with metadata).
  await admin.from("profiles").upsert({
    id: invited.user.id,
    email: data.email.toLowerCase(),
    first_name: data.first_name,
    last_name: data.last_name,
    display_name: displayName,
    role: data.role,
    year_group: data.year_group ?? null,
    is_active: true,
  });

  if (data.role === "student" && data.class_ids.length) {
    const rows = data.class_ids.map((class_id) => ({
      class_id,
      student_id: invited.user!.id,
    }));
    await admin.from("class_members").upsert(rows, {
      onConflict: "class_id,student_id",
    });
  }

  revalidatePath("/admin/users");
  return { success: `Invitation sent to ${data.email}` };
}

export async function updateUserAction(
  userId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertAdmin();

  const classIds = formData.getAll("class_ids").map(String).filter(Boolean);
  const isActiveValues = formData.getAll("is_active").map(String);
  const parsed = updateUserSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    year_group: formData.get("year_group") || null,
    is_active: isActiveValues.includes("true"),
    class_ids: classIds,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid user data" };
  }

  const data = parsed.data;
  const displayName = `${data.first_name} ${data.last_name}`.trim();

  // App-level guard (matches DB RPC): admins cannot change their own role.
  if (actor.id === userId && data.role !== actor.role) {
    return { error: "Users cannot change their own role" };
  }

  // Use the authenticated admin session so auth.uid() is preserved inside the
  // SECURITY DEFINER RPC (do not use the service-role client for role edits).
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: userId,
    p_first_name: data.first_name,
    p_last_name: data.last_name,
    p_display_name: displayName,
    p_role: data.role,
    p_year_group: data.year_group ?? "",
    p_is_active: data.is_active,
  });

  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      first_name: data.first_name,
      last_name: data.last_name,
      display_name: displayName,
      role: data.role,
      year_group: data.year_group ?? "",
    },
    ban_duration: data.is_active ? "none" : "876000h",
  });

  // Sync class memberships for students
  await admin.from("class_members").delete().eq("student_id", userId);
  if (data.role === "student" && data.class_ids.length) {
    await admin.from("class_members").insert(
      data.class_ids.map((class_id) => ({
        class_id,
        student_id: userId,
      })),
    );
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: "User updated" };
}

export async function deactivateUserAction(userId: string): Promise<ActionResult> {
  const actor = await assertAdmin();
  if (actor.id === userId) {
    return { error: "You cannot deactivate your own account" };
  }

  // Authenticated admin update preserves auth.uid() for the security trigger.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  revalidatePath("/admin/users");
  return { success: "User deactivated" };
}

export async function resetUserPasswordAction(
  userId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  if (!profile) return { error: "User not found" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${getAppUrl()}/auth/callback`,
  });
  if (error) return { error: error.message };
  return { success: `Password reset email sent to ${profile.email}` };
}

export async function createClassAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await assertAdmin();
  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject") || "English",
    year_group: formData.get("year_group") || null,
    teacher_id: formData.get("teacher_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid class" };
  }

  const admin = createAdminClient();
  let joinCode = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await admin.from("classes").insert({
      ...parsed.data,
      join_code: joinCode,
    });
    if (!error) {
      revalidatePath("/admin/classes");
      return { success: "Class created" };
    }
    if (error.code === "23505") {
      joinCode = generateJoinCode();
      continue;
    }
    return { error: error.message };
  }
  return { error: "Could not generate a unique join code" };
}

export async function assignStudentToClassAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("class_members").upsert(
    { class_id: classId, student_id: studentId },
    { onConflict: "class_id,student_id" },
  );
  if (error) return { error: error.message };
  revalidatePath("/admin/classes");
  return { success: "Student assigned" };
}

export async function removeStudentFromClassAction(
  classId: string,
  studentId: string,
): Promise<ActionResult> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) return { error: error.message };
  revalidatePath("/admin/classes");
  return { success: "Student removed from class" };
}

export type ImportSummary = {
  successful: number;
  skipped: number;
  failed: number;
  details: { rowNumber: number; email: string; status: string; message: string }[];
};

export async function previewCsvImportAction(
  csvText: string,
): Promise<{ rows: ParsedCsvRow[]; error?: string }> {
  await assertAdmin();
  if (!csvText.trim()) return { rows: [], error: "CSV is empty" };
  return { rows: parseCsv(csvText) };
}

export async function confirmCsvImportAction(
  csvText: string,
): Promise<{ summary?: ImportSummary; error?: string }> {
  await assertAdmin();
  const rows = parseCsv(csvText);
  if (!rows.length) return { error: "No rows to import" };
  if (rows.some((r) => r.errors.length > 0 && !r.data)) {
    // Allow continuing only for valid rows; reject if header error
    if (rows.length === 1 && !rows[0]?.data) {
      return { error: rows[0]?.errors.join("; ") ?? "Invalid CSV" };
    }
  }

  const invalid = rows.filter((r) => r.errors.length > 0);
  if (invalid.length === rows.length) {
    return { error: "All rows have validation errors. Fix them before importing." };
  }

  const admin = createAdminClient();
  const summary: ImportSummary = {
    successful: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  // Prefetch existing emails
  const { data: existingProfiles } = await admin
    .from("profiles")
    .select("email, id");
  const emailToId = new Map(
    (existingProfiles ?? []).map((p) => [p.email.toLowerCase(), p.id]),
  );

  // Prefetch classes by name
  const { data: existingClasses } = await admin
    .from("classes")
    .select("id, name, teacher_id");
  const classByName = new Map(
    (existingClasses ?? []).map((c) => [c.name.toLowerCase(), c]),
  );

  // Default teacher for auto-created classes: first active teacher
  const { data: teachers } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "teacher")
    .eq("is_active", true)
    .limit(1);
  const defaultTeacherId = teachers?.[0]?.id;

  for (const row of rows) {
    if (!row.data || row.errors.length > 0) {
      summary.failed += 1;
      summary.details.push({
        rowNumber: row.rowNumber,
        email: row.raw.email ?? "",
        status: "failed",
        message: row.errors.join("; ") || "Validation failed",
      });
      continue;
    }

    const data = row.data;
    const email = data.email.toLowerCase();

    if (emailToId.has(email)) {
      summary.skipped += 1;
      summary.details.push({
        rowNumber: row.rowNumber,
        email,
        status: "skipped",
        message: "Email already exists",
      });
      continue;
    }

    try {
      const displayName = `${data.first_name} ${data.last_name}`.trim();
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          data: {
            first_name: data.first_name,
            last_name: data.last_name,
            display_name: displayName,
            role: data.role,
            year_group: data.year_group ?? "",
          },
          redirectTo: `${getAppUrl()}/auth/callback`,
        },
      );

      if (error || !invited.user) {
        summary.failed += 1;
        summary.details.push({
          rowNumber: row.rowNumber,
          email,
          status: "failed",
          message: error?.message ?? "Invite failed",
        });
        continue;
      }

      await admin.from("profiles").upsert({
        id: invited.user.id,
        email,
        first_name: data.first_name,
        last_name: data.last_name,
        display_name: displayName,
        role: data.role,
        year_group: data.year_group,
        is_active: true,
      });

      emailToId.set(email, invited.user.id);

      if (data.role === "student" && data.class_name) {
        const key = data.class_name.toLowerCase();
        let classId = classByName.get(key)?.id;
        if (!classId) {
          if (!defaultTeacherId) {
            summary.details.push({
              rowNumber: row.rowNumber,
              email,
              status: "partial",
              message: "User created but class could not be created (no teacher)",
            });
          } else {
            const joinCode = generateJoinCode();
            const { data: createdClass, error: classError } = await admin
              .from("classes")
              .insert({
                name: data.class_name,
                subject: "English",
                year_group: data.year_group,
                teacher_id: defaultTeacherId,
                join_code: joinCode,
              })
              .select("id, name")
              .single();
            if (classError || !createdClass) {
              summary.details.push({
                rowNumber: row.rowNumber,
                email,
                status: "partial",
                message: `User created but class failed: ${classError?.message}`,
              });
            } else {
              classId = createdClass.id;
              classByName.set(key, {
                id: createdClass.id,
                name: createdClass.name,
                teacher_id: defaultTeacherId,
              });
            }
          }
        }
        if (classId) {
          await admin.from("class_members").upsert(
            { class_id: classId, student_id: invited.user.id },
            { onConflict: "class_id,student_id" },
          );
        }
      }

      summary.successful += 1;
      summary.details.push({
        rowNumber: row.rowNumber,
        email,
        status: "success",
        message: "Invited",
      });
    } catch (err) {
      summary.failed += 1;
      summary.details.push({
        rowNumber: row.rowNumber,
        email,
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/classes");
  return { summary };
}
