"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

export function Topbar({
  onMenuClick,
  platformDisplayName = "Homework Passport",
}: {
  onMenuClick: () => void;
  platformDisplayName?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
      <button
        className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>
      <p className="text-sm font-medium text-slate-700 lg:hidden">
        {platformDisplayName}
      </p>
      <div className="ml-auto">
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
