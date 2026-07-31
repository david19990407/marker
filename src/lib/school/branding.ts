import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ACCENT_COLOUR,
  DEFAULT_PLATFORM_DISPLAY_NAME,
  DEFAULT_PRIMARY_COLOUR,
  DEFAULT_SECONDARY_COLOUR,
  platformInitials,
  type Branding,
} from "@/lib/school/branding-shared";

export type { Branding } from "@/lib/school/branding-shared";
export {
  DEFAULT_ACCENT_COLOUR,
  DEFAULT_PLATFORM_DISPLAY_NAME,
  DEFAULT_PRIMARY_COLOUR,
  DEFAULT_SECONDARY_COLOUR,
  brandShades,
  brandingStyleVars,
  platformInitials,
  schoolSubtitle,
} from "@/lib/school/branding-shared";

const PLACEHOLDER_SCHOOL_NAMES = new Set(["", "my school"]);

function isHexColour(value: string | null | undefined): value is string {
  return Boolean(value && /^#[0-9A-Fa-f]{6}$/.test(value.trim()));
}

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
      .select(
        "school_name, platform_display_name, primary_colour, secondary_colour, accent_colour",
      )
      .limit(1)
      .maybeSingle();

    const platformDisplayName =
      data?.platform_display_name?.trim() || DEFAULT_PLATFORM_DISPLAY_NAME;
    const { schoolName, schoolNameRaw } = normaliseSchoolName(data?.school_name);
    const primaryColour = isHexColour(data?.primary_colour)
      ? data!.primary_colour!.trim()
      : DEFAULT_PRIMARY_COLOUR;
    const secondaryColour = isHexColour(data?.secondary_colour)
      ? data!.secondary_colour!.trim()
      : DEFAULT_SECONDARY_COLOUR;
    const accentColour = isHexColour(data?.accent_colour)
      ? data!.accent_colour!.trim()
      : DEFAULT_ACCENT_COLOUR;

    return {
      platformDisplayName,
      schoolName,
      schoolNameRaw,
      primaryColour,
      secondaryColour,
      accentColour,
      initials: platformInitials(platformDisplayName),
    };
  } catch {
    return {
      platformDisplayName: DEFAULT_PLATFORM_DISPLAY_NAME,
      schoolName: null,
      schoolNameRaw: "",
      primaryColour: DEFAULT_PRIMARY_COLOUR,
      secondaryColour: DEFAULT_SECONDARY_COLOUR,
      accentColour: DEFAULT_ACCENT_COLOUR,
      initials: "HP",
    };
  }
}
