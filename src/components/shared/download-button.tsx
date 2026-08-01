"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DownloadButton({
  bucket,
  path,
  label = "Download",
}: {
  bucket: "assignment-resources" | "student-submissions" | "marking-stamps";
  path: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch("/api/files/signed-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bucket, path }),
            });
            const data = (await res.json()) as { url?: string; error?: string };
            if (!res.ok || !data.url) {
              setError(data.error ?? "Download failed");
              return;
            }
            window.open(data.url, "_blank", "noopener,noreferrer");
          } catch {
            setError("Download failed");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Preparing…" : label}
      </Button>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
