import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type Tone = "brand" | "success" | "warning" | "neutral" | "danger";

const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
};

export function Badge({
  className,
  tone = "brand",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
