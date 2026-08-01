"use client";

import { useEffect, useState } from "react";

function isHttpUrl(path: string) {
  return path.startsWith("http://") || path.startsWith("https://");
}

export function useSignedUrl(
  bucket: "assignment-resources" | "student-submissions",
  path: string | null | undefined,
) {
  const [resolved, setResolved] = useState<{
    path: string;
    url: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!path || isHttpUrl(path)) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/files/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket, path }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.url) {
          setResolved({
            path,
            url: null,
            error: data.error ?? "Unable to load file",
          });
          return;
        }
        setResolved({ path, url: data.url, error: null });
      } catch {
        if (!cancelled) {
          setResolved({ path, url: null, error: "Unable to load file" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (!path) return { url: null, error: null };
  if (isHttpUrl(path)) return { url: path, error: null };
  if (resolved?.path === path) {
    return { url: resolved.url, error: resolved.error };
  }
  return { url: null, error: null };
}

export function SignedImage({
  path,
  alt,
  className,
  bucket = "assignment-resources",
}: {
  path: string;
  alt: string;
  className?: string;
  bucket?: "assignment-resources" | "student-submissions";
}) {
  const { url, error } = useSignedUrl(bucket, path);
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!url) {
    return (
      <div className="flex h-40 items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading image…
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

export function SignedVideo({
  path,
  className,
  bucket = "assignment-resources",
  captions,
}: {
  path: string;
  className?: string;
  bucket?: "assignment-resources" | "student-submissions";
  captions?: string | null;
}) {
  const { url, error } = useSignedUrl(bucket, path);
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center bg-slate-900 text-sm text-slate-300">
        Loading video…
      </div>
    );
  }
  return (
    <video controls className={className} src={url} playsInline>
      {captions ? <track kind="captions" srcLang="en" label="Captions" /> : null}
    </video>
  );
}
