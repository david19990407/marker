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
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/files/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket: "marking-stamps",
            path: storagePath,
          }),
        });
        const json = (await res.json()) as { url?: string };
        if (!cancelled) setUrl(json.url ?? null);
      } catch {
        if (!cancelled) setUrl(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (!storagePath || !url) {
    return (
      <span
        className={className}
        aria-label={alt}
        title={alt}
      >
        ★
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      draggable={false}
    />
  );
}
