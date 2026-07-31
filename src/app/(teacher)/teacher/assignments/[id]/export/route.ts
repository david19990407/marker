import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, maximum_mark, teacher_id")
    .eq("id", id)
    .eq("teacher_id", user.id)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("submissions")
    .select(
      "status, submitted_at, returned_at, student:profiles!submissions_student_id_fkey(display_name, email), feedback(mark, status, released_at)",
    )
    .eq("assignment_id", id);

  const lines = [
    [
      "student_name",
      "student_email",
      "submission_status",
      "submitted_at",
      "mark",
      "feedback_status",
      "returned_at",
    ].join(","),
  ];

  for (const row of rows ?? []) {
    const student = Array.isArray(row.student) ? row.student[0] : row.student;
    const feedback = Array.isArray(row.feedback) ? row.feedback[0] : row.feedback;
    lines.push(
      [
        csv(student?.display_name),
        csv(student?.email),
        csv(row.status),
        csv(row.submitted_at),
        csv(feedback?.mark?.toString() ?? ""),
        csv(feedback?.status ?? ""),
        csv(row.returned_at),
      ].join(","),
    );
  }

  const filename = `${assignment.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_results.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csv(value?: string | null) {
  const v = value ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
