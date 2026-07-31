import { createClient } from "@/lib/supabase/server";

export type Branding = {
  /** Platform / product name shown in UI chrome */
  platformDisplayName: string;
  /** Organisation name, or null when unset / placeholder */
  schoolName: string | null;
  /** Raw school_name from settings (may be placeholder) */
  schoolNameRaw: string;
};

export const DEFAULT_PLATFORM_DISPLAY_NAME = "Homework Passport";
const PLACEHOLDER_SCHOOL_NAMES = new Set(["", "my school"]);

function normaliseSchoolName(raw: string | null | undefined): {
  schoolName: string | null;
  schoolNameRaw: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || PLACEHOLDER_SCHOOL_NAMES.has(trimmed.toLowerCase())) {
    return { schoolName: null, schoolNameRaw: trimmed };
  }
  return { schoolName: trimmed, schoolNameRaw: trimmed };
}

/** Safe server-side branding loader with fallbacks (never throws). */
export async function getBranding(): Promise<Branding> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_settings")
      .select("school_name, platform_display_name")
      .limit(1)
      .maybeSingle();

    const platformDisplayName =
      data?.platform_display_name?.trim() || DEFAULT_PLATFORM_DISPLAY_NAME;
    const { schoolName, schoolNameRaw } = normaliseSchoolName(data?.school_name);

    return { platformDisplayName, schoolName, schoolNameRaw };
  } catch {
    return {
      platformDisplayName: DEFAULT_PLATFORM_DISPLAY_NAME,
      schoolName: null,
      schoolNameRaw: "",
    };
  }
}

export function schoolSubtitle(
  platformDisplayName: string,
  schoolName: string | null,
): string | null {
  if (!schoolName) return null;
  return `${platformDisplayName} for ${schoolName}`;
}
