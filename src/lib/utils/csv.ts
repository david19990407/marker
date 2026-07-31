import { csvImportRowSchema, type CsvImportRow } from "@/lib/validations/admin";

export type ParsedCsvRow = {
  rowNumber: number;
  raw: Record<string, string>;
  data?: CsvImportRow;
  errors: string[];
};

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(text: string): ParsedCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = parseLine(lines[0]!).map((h) => h.toLowerCase());
  const required = ["first_name", "last_name", "email", "role"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    return [
      {
        rowNumber: 1,
        raw: {},
        errors: [`Missing required columns: ${missing.join(", ")}`],
      },
    ];
  }

  const seenEmails = new Map<string, number>();
  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseLine(lines[i]!);
    const raw: Record<string, string> = {};
    headers.forEach((header, idx) => {
      raw[header] = values[idx] ?? "";
    });

    const errors: string[] = [];
    const parsed = csvImportRowSchema.safeParse({
      first_name: raw.first_name,
      last_name: raw.last_name,
      email: raw.email,
      role: raw.role?.toLowerCase(),
      year_group: raw.year_group || undefined,
      class_name: raw.class_name || null,
    });

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        errors.push(`${issue.path.join(".") || "row"}: ${issue.message}`);
      });
    }

    const email = (raw.email || "").toLowerCase();
    if (email && seenEmails.has(email)) {
      errors.push(`Duplicate email also on row ${seenEmails.get(email)}`);
    } else if (email) {
      seenEmails.set(email, i + 1);
    }

    rows.push({
      rowNumber: i + 1,
      raw,
      data: parsed.success ? parsed.data : undefined,
      errors,
    });
  }

  return rows;
}

export const CSV_TEMPLATE = `first_name,last_name,email,role,year_group,class_name
Alex,Morgan,alex.morgan@school.edu,student,Year 11,11A English
Jordan,Lee,jordan.lee@school.edu,student,Year 12,12B English
Sam,Taylor,sam.taylor@school.edu,student,Year 13,13A English
Ms,Harper,ms.harper@school.edu,teacher,,
`;
