import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubjectIcon } from "@/components/shared/subject-icon";

export type ClassCardData = {
  id: string;
  name: string;
  subject: string;
  year_group: string | null;
  colour_hex?: string | null;
  archived?: boolean;
  subjectIconType?: string | null;
  subjectIconValue?: string | null;
  subjectColour?: string | null;
  leadTeacher?: string | null;
  additionalTeachers?: string[];
  activeHomeworkCount?: number;
  overdueHomeworkCount?: number;
  hasRecentFeedback?: boolean;
  href: string;
};

export function ClassCard({ data }: { data: ClassCardData }) {
  const colour = data.subjectColour || data.colour_hex || "#7C3AED";
  const extras = (data.additionalTeachers ?? []).filter(Boolean);

  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <SubjectIcon
          name={data.subject}
          iconType={data.subjectIconType}
          iconValue={data.subjectIconValue}
          colour={colour}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-slate-900">{data.name}</h2>
            {data.archived ? <Badge tone="neutral">Archived</Badge> : null}
            {data.hasRecentFeedback ? (
              <Badge tone="success">New feedback</Badge>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            {data.subject}
            {data.year_group ? ` · ${data.year_group}` : ""}
          </p>
          {data.leadTeacher ? (
            <p className="mt-1 text-xs text-slate-500">
              Lead: {data.leadTeacher}
              {extras.length
                ? ` · Also: ${extras.slice(0, 3).join(", ")}${extras.length > 3 ? "…" : ""}`
                : ""}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {typeof data.activeHomeworkCount === "number" ? (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
                {data.activeHomeworkCount} active homework
              </span>
            ) : null}
            {typeof data.overdueHomeworkCount === "number" &&
            data.overdueHomeworkCount > 0 ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
                {data.overdueHomeworkCount} overdue
              </span>
            ) : null}
          </div>
          <Link href={data.href} className="mt-4 inline-block">
            <Button size="sm" variant="secondary">
              Open class
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
