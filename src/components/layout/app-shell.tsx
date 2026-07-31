"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { Profile } from "@/lib/types";

export function AppShell({
  profile,
  children,
  platformDisplayName = "Homework Passport",
  schoolName = null,
}: {
  profile: Profile;
  children: React.ReactNode;
  platformDisplayName?: string;
  schoolName?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.08),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(167,139,250,0.12),_transparent_30%),#fafafa]">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        profile={profile}
        platformDisplayName={platformDisplayName}
        schoolName={schoolName}
      />
      <div className="lg:pl-72">
        <Topbar
          onMenuClick={() => setOpen(true)}
          platformDisplayName={platformDisplayName}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
