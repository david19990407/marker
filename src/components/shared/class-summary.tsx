import { SubjectIcon } from "@/components/shared/subject-icon";
import { Badge } from "@/components/ui/badge";

export function ClassSummary({
  name,
  subject,
  yearGroup,
  colourHex,
  subjectIconType,
  subjectIconValue,
  subjectColour,
  archived,
  joinCode,
  showAdminManagedNote = true,
}: {
  name: string;
  subject: string;
  yearGroup: string | null;
  colourHex?: string | null;
  subjectIconType?: string | null;
  subjectIconValue?: string | null;
  subjectColour?: string | null;
  archived?: boolean;
  joinCode?: string | null;
  showAdminManagedNote?: boolean;
}) {
  const colour = subjectColour || colourHex || "#7C3AED";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <SubjectIcon
          name={subject}
          iconType={subjectIconType}
          iconValue={subjectIconValue}
          colour={colour}
          size="lg"
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
            <Badge tone={archived ? "neutral" : "success"}>
              {archived ? "Archived" : "Active"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {subject}
            {yearGroup ? ` · ${yearGroup}` : ""}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Class colour:{" "}
            <span
              className="inline-block h-3 w-3 rounded-full align-middle"
              style={{ backgroundColor: colour }}
            />{" "}
            <span className="font-mono">{colour}</span>
          </p>
          {joinCode ? (
            <p className="mt-2 text-sm text-slate-700">
              Join code:{" "}
              <span className="font-mono text-base font-semibold">{joinCode}</span>
            </p>
          ) : null}
        </div>
      </div>
      {showAdminManagedNote ? (
        <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Class name, subject, year group and colour are managed by an
          administrator.
        </p>
      ) : null}
    </div>
  );
}
