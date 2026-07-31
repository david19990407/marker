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
