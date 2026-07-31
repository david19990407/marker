import { createClient } from "@/lib/supabase/server";
import { YEAR_GROUPS } from "@/lib/types";

export type YearGroupOption = {
  id: string;
  name: string;
  code: string | null;
  display_order: number;
  is_active: boolean;
  archived_at: string | null;
};

export type SubjectOption = {
  id: string;
  name: string;
  code: string | null;
  icon_type: "built_in" | "upload";
  icon_value: string;
  colour: string;
  display_order: number;
  is_active: boolean;
  archived_at: string | null;
};

export type ClassColourOption = {
  id: string;
  name: string;
  hex: string;
  display_order: number;
  is_active: boolean;
};

export const BUILT_IN_SUBJECT_ICONS = [
  { key: "book", label: "Book" },
  { key: "book-open", label: "Open book" },
  { key: "calculator", label: "Calculator" },
  { key: "flask", label: "Flask" },
  { key: "landmark", label: "Landmark" },
  { key: "globe", label: "Globe" },
  { key: "languages", label: "Languages" },
  { key: "palette", label: "Palette" },
  { key: "cpu", label: "CPU" },
  { key: "music", label: "Music" },
  { key: "dumbbell", label: "PE" },
  { key: "atom", label: "Atom" },
] as const;

const FALLBACK_COLOURS: ClassColourOption[] = [
  { id: "violet", name: "Violet", hex: "#7C3AED", display_order: 1, is_active: true },
  { id: "indigo", name: "Indigo", hex: "#4F46E5", display_order: 2, is_active: true },
  { id: "blue", name: "Blue", hex: "#2563EB", display_order: 3, is_active: true },
  { id: "teal", name: "Teal", hex: "#0D9488", display_order: 4, is_active: true },
  { id: "green", name: "Green", hex: "#16A34A", display_order: 5, is_active: true },
  { id: "amber", name: "Amber", hex: "#D97706", display_order: 6, is_active: true },
  { id: "rose", name: "Rose", hex: "#E11D48", display_order: 7, is_active: true },
  { id: "slate", name: "Slate", hex: "#475569", display_order: 8, is_active: true },
];

function mapYearGroup(row: {
  id: string;
  label?: string | null;
  name?: string | null;
  code?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  archived_at?: string | null;
}): YearGroupOption {
  return {
    id: row.id,
    name: (row.name || row.label || "").trim(),
    code: row.code ?? null,
    display_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
    archived_at: row.archived_at ?? null,
  };
}

function mapSubject(row: {
  id: string;
  name: string;
  code?: string | null;
  icon_type?: string | null;
  icon_value?: string | null;
  icon_key?: string | null;
  icon_storage_path?: string | null;
  colour?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  archived_at?: string | null;
}): SubjectOption {
  const iconType =
    row.icon_type === "upload" ||
    (row.icon_storage_path && row.icon_storage_path.trim())
      ? "upload"
      : "built_in";
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    icon_type: iconType,
    icon_value:
      (iconType === "upload"
        ? row.icon_value || row.icon_storage_path
        : row.icon_value || row.icon_key) || "book",
    colour: row.colour || "#7C3AED",
    display_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
    archived_at: row.archived_at ?? null,
  };
}

/** Active year group display names for dropdowns (never throws). */
export async function getActiveYearGroups(): Promise<string[]> {
  const rows = await getActiveYearGroupOptions();
  if (rows.length) return rows.map((r) => r.name);
  return [...YEAR_GROUPS];
}

export async function getActiveYearGroupOptions(): Promise<YearGroupOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_year_groups")
      .select("id, label, name, code, sort_order, is_active, archived_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("sort_order");
    if (data?.length) return data.map(mapYearGroup).filter((r) => r.name);
  } catch {
    // fallback below
  }
  return YEAR_GROUPS.map((name, index) => ({
    id: `fallback-${index}`,
    name,
    code: null,
    display_order: index + 1,
    is_active: true,
    archived_at: null,
  }));
}

export async function getAllYearGroupOptions(): Promise<YearGroupOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_year_groups")
      .select("id, label, name, code, sort_order, is_active, archived_at")
      .order("sort_order");
    if (data?.length) return data.map(mapYearGroup).filter((r) => r.name);
  } catch {
    // ignore
  }
  return getActiveYearGroupOptions();
}

export async function getActiveSubjects(): Promise<string[]> {
  const rows = await getActiveSubjectOptions();
  return rows.map((r) => r.name);
}

export async function getActiveSubjectOptions(): Promise<SubjectOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_subjects")
      .select(
        "id, name, code, icon_type, icon_value, icon_key, icon_storage_path, colour, sort_order, is_active, archived_at",
      )
      .eq("is_active", true)
      .is("archived_at", null)
      .order("sort_order");
    if (data?.length) return data.map(mapSubject);
  } catch {
    // fallback
  }
  return [
    {
      id: "fallback-english",
      name: "English",
      code: "ENG",
      icon_type: "built_in",
      icon_value: "book",
      colour: "#7C3AED",
      display_order: 1,
      is_active: true,
      archived_at: null,
    },
  ];
}

export async function getAllSubjectOptions(): Promise<SubjectOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_subjects")
      .select(
        "id, name, code, icon_type, icon_value, icon_key, icon_storage_path, colour, sort_order, is_active, archived_at",
      )
      .order("sort_order");
    if (data?.length) return data.map(mapSubject);
  } catch {
    // ignore
  }
  return getActiveSubjectOptions();
}

export async function getActiveColours(): Promise<{ name: string; hex: string }[]> {
  const rows = await getActiveColourOptions();
  return rows.map((r) => ({ name: r.name, hex: r.hex }));
}

export async function getActiveColourOptions(): Promise<ClassColourOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_class_colours")
      .select("id, name, hex, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order");
    if (data?.length) {
      return data.map((r) => ({
        id: r.id,
        name: r.name,
        hex: r.hex,
        display_order: r.sort_order ?? 0,
        is_active: r.is_active ?? true,
      }));
    }
  } catch {
    // fallback
  }
  return FALLBACK_COLOURS;
}

export async function getAllColourOptions(): Promise<ClassColourOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_class_colours")
      .select("id, name, hex, sort_order, is_active")
      .order("sort_order");
    if (data?.length) {
      return data.map((r) => ({
        id: r.id,
        name: r.name,
        hex: r.hex,
        display_order: r.sort_order ?? 0,
        is_active: r.is_active ?? true,
      }));
    }
  } catch {
    // ignore
  }
  return FALLBACK_COLOURS;
}
