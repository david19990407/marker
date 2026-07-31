import {
  Atom,
  Book,
  BookOpen,
  Calculator,
  Cpu,
  Dumbbell,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Music,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BUILT_IN_ICON_MAP: Record<string, LucideIcon> = {
  book: Book,
  "book-open": BookOpen,
  calculator: Calculator,
  flask: FlaskConical,
  landmark: Landmark,
  globe: Globe,
  languages: Languages,
  palette: Palette,
  cpu: Cpu,
  music: Music,
  dumbbell: Dumbbell,
  atom: Atom,
};

export type SubjectIconProps = {
  name: string;
  iconType?: "built_in" | "upload" | string | null;
  iconValue?: string | null;
  colour?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const SIZE_MAP = {
  sm: { box: "h-9 w-9", icon: "h-4 w-4", pad: "p-1.5" },
  md: { box: "h-11 w-11", icon: "h-5 w-5", pad: "p-2" },
  lg: { box: "h-14 w-14", icon: "h-6 w-6", pad: "p-2.5" },
} as const;

/**
 * Shared subject icon renderer. Always uses a fixed container so built-in
 * and uploaded PNG/SVG icons align consistently across roles.
 */
export function SubjectIcon({
  name,
  iconType = "built_in",
  iconValue,
  colour = "#7C3AED",
  size = "md",
  className,
  label,
}: SubjectIconProps) {
  const dims = SIZE_MAP[size];
  const accessibleLabel = label || `${name} subject icon`;
  const bg = colour || "#7C3AED";
  const isUpload =
    iconType === "upload" ||
    Boolean(iconValue && /^(https?:|\/|data:image)/i.test(iconValue));

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 shadow-sm",
        dims.box,
        dims.pad,
        className,
      )}
      style={{ backgroundColor: bg }}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {isUpload && iconValue ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconValue}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        (() => {
          const Icon =
            BUILT_IN_ICON_MAP[iconValue || "book"] ||
            BUILT_IN_ICON_MAP.book ||
            Book;
          return <Icon className={cn(dims.icon, "text-white")} aria-hidden />;
        })()
      )}
    </span>
  );
}
