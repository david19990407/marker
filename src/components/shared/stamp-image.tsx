"use client";

import { useEffect, useState } from "react";

/** Loads a private marking-stamps object via signed URL. */
export function StampImage({
  storagePath,
  alt,
  className,
}: {
  storagePath: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const path = storagePath?.trim() || "";
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/files/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket: "marking-stamps",
            path,
          }),
        });
        const json = (await res.json()) as { url?: string };
        if (!cancelled && json.url) {
          setLoaded({ path, url: json.url });
        }
      } catch {
        // Keep placeholder on failure.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const url = loaded?.path === path ? loaded.url : null;

  if (!path || !url) {
    return (
      <span className={className} aria-label={alt} title={alt}>
        ★
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} draggable={false} />
  );
}
