"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  School,
  Settings,
  SlidersHorizontal,
  Upload,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

function navForRole(role: Profile["role"]): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/users/import", label: "CSV Import", icon: Upload },
      { href: "/admin/classes", label: "Classes", icon: School },
      {
        href: "/admin/settings",
        label: "School settings",
        icon: SlidersHorizontal,
      },
      { href: "/settings", label: "Settings", icon: Settings },
    ];
  }
  if (role === "teacher") {
    return [
      { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/teacher/classes", label: "My Classes", icon: School },
      { href: "/teacher/assignments", label: "Assignments", icon: BookOpen },
      { href: "/teacher/marking", label: "Marking Queue", icon: ClipboardList },
      { href: "/settings", label: "Settings", icon: Settings },
    ];
  }
  return [
    { href: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/student/homework", label: "Homework", icon: BookOpen },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
}

export function Sidebar({
  open,
  onClose,
  profile,
  platformDisplayName = "Homework Passport",
  schoolName = null,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  platformDisplayName?: string;
  schoolName?: string | null;
}) {
  const pathname = usePathname();
  const nav = navForRole(profile.role);
  const initials = platformDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "HP";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-100 bg-white/95 px-4 py-5 shadow-xl backdrop-blur transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {platformDisplayName}
              </p>
              {schoolName ? (
                <p className="text-xs text-slate-500">{schoolName}</p>
              ) : null}
            </div>
          </Link>
          <button
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-brand-50 text-brand-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    active ? "text-brand-600" : "text-slate-400",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-sm font-semibold text-white">
              {profile.first_name[0]}
              {profile.last_name[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {profile.display_name}
              </p>
              <p className="truncate text-xs capitalize text-slate-500">
                {profile.role}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
