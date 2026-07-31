export type Branding = {
  platformDisplayName: string;
  schoolName: string | null;
  schoolNameRaw: string;
  primaryColour: string;
  secondaryColour: string;
  accentColour: string;
  initials: string;
};

export const DEFAULT_PLATFORM_DISPLAY_NAME = "Homework Passport";
export const DEFAULT_PRIMARY_COLOUR = "#7C3AED";
export const DEFAULT_SECONDARY_COLOUR = "#4F46E5";
export const DEFAULT_ACCENT_COLOUR = "#0D9488";

export function platformInitials(platformDisplayName: string): string {
  const parts = platformDisplayName.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "HP";
}

export function brandShades(primary: string): Record<string, string> {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(primary) ? primary : DEFAULT_PRIMARY_COLOUR;
  return {
    "--brand-50": `color-mix(in oklab, ${hex} 10%, white)`,
    "--brand-100": `color-mix(in oklab, ${hex} 18%, white)`,
    "--brand-400": `color-mix(in oklab, ${hex} 72%, white)`,
    "--brand-500": `color-mix(in oklab, ${hex} 88%, white)`,
    "--brand-600": hex,
    "--brand-700": `color-mix(in oklab, ${hex} 82%, black)`,
    "--color-primary": hex,
    "--color-secondary": "var(--secondary-colour)",
    "--color-accent": "var(--accent-colour)",
  };
}

export function brandingStyleVars(branding: Branding): Record<string, string> {
  return {
    ...brandShades(branding.primaryColour),
    "--primary-colour": branding.primaryColour,
    "--secondary-colour": branding.secondaryColour,
    "--accent-colour": branding.accentColour,
  };
}

export function schoolSubtitle(
  platformDisplayName: string,
  schoolName: string | null,
): string | null {
  if (!schoolName) return null;
  return `${platformDisplayName} for ${schoolName}`;
}
