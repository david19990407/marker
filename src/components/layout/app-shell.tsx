"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { Profile } from "@/lib/types";
import type { Branding } from "@/lib/school/branding-shared";
import { brandingStyleVars } from "@/lib/school/branding-shared";

export function AppShell({
  profile,
  children,
  branding,
  platformDisplayName,
  schoolName,
}: {
  profile: Profile;
  children: React.ReactNode;
  branding?: Branding;
  platformDisplayName?: string;
  schoolName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const platform =
    branding?.platformDisplayName || platformDisplayName || "Homework Passport";
  const school = branding?.schoolName ?? schoolName ?? null;
  const style = branding
    ? (brandingStyleVars(branding) as React.CSSProperties)
    : undefined;

  return (
    <div
      style={style}
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--brand-600)_12%,transparent),_transparent_35%),radial-gradient(circle_at_top_right,_color-mix(in_oklab,var(--brand-400)_14%,transparent),_transparent_30%),#fafafa]"
    >
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        profile={profile}
        platformDisplayName={platform}
        schoolName={school}
      />
      <div className="lg:pl-72">
        <Topbar
          onMenuClick={() => setOpen(true)}
          platformDisplayName={platform}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
