import { createClient } from "@/lib/supabase/server";
import { YEAR_GROUPS } from "@/lib/types";

const FALLBACK_SUBJECTS = [
  "English",
  "Mathematics",
  "Science",
  "History",
  "Geography",
  "Languages",
  "Art",
  "Computing",
];

const FALLBACK_COLOURS = [
  { name: "Violet", hex: "#7c3aed" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Slate", hex: "#475569" },
];

export async function getActiveYearGroups(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_year_groups")
      .select("label")
      .eq("is_active", true)
      .order("sort_order");
    if (data && data.length > 0) {
      return data.map((r) => r.label);
    }
  } catch {
    // fallback below
  }
  return [...YEAR_GROUPS];
}

export async function getActiveSubjects(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_subjects")
      .select("name")
      .eq("is_active", true)
      .order("sort_order");
    if (data && data.length > 0) {
      return data.map((r) => r.name);
    }
  } catch {
    // fallback below
  }
  return FALLBACK_SUBJECTS;
}

export async function getActiveColours(): Promise<{ name: string; hex: string }[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_class_colours")
      .select("name, hex")
      .eq("is_active", true)
      .order("sort_order");
    if (data && data.length > 0) {
      return data;
    }
  } catch {
    // fallback below
  }
  return FALLBACK_COLOURS;
}
