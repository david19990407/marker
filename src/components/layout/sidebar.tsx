"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  ChartNoAxesCombined,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";

const studentNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lessons", label: "My Lessons", icon: BookOpen },
  { href: "/revision", label: "Revision Hub", icon: Brain },
  { href: "/essay", label: "Essay Marking", icon: ClipboardCheck },
  { href: "/coach", label: "AI Coach", icon: MessageSquareText },
  { href: "/catch-up", label: "Catch Up", icon: Sparkles },
  { href: "/progress", label: "My Progress", icon: ChartNoAxesCombined },
  { href: "/resources", label: "Resources", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

const teacherNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/lessons", label: "Manage Lessons", icon: GraduationCap },
  { href: "/teacher/quizzes", label: "Quizzes", icon: Brain },
  { href: "/teacher/essays", label: "Essay Reviews", icon: ClipboardCheck },
  { href: "/teacher/analytics", label: "Student Progress", icon: Users },
  { href: "/resources", label: "Resources", icon: FolderOpen },
  { href: "/teacher/ai-settings", label: "AI Settings", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const nav = user?.role === "teacher" ? teacherNav : studentNav;

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
          <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">LitCoach AI</p>
              <p className="text-xs text-slate-500">GCSE English</p>
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
                    "h-5 w-5 transition",
                    active
                      ? "text-brand-600"
                      : "text-slate-400 group-hover:text-slate-600",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {user ? (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-sm font-semibold text-white">
                {user.avatarInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {user.name}
                </p>
                <p className="truncate text-xs capitalize text-slate-500">
                  {user.role}
                  {user.yearGroup ? ` · ${user.yearGroup}` : ""}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
