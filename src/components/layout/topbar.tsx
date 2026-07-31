"use client";

import { Bell, Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
      <button
        className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search lessons, resources, topics..."
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
        </button>
        {user ? (
          <Button variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        ) : null}
      </div>
    </header>
  );
}
