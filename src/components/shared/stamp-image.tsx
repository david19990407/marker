"use client";

import { useEffect, useState } from "react";

type CacheEntry = { url: string; expiresAt: number };

const urlCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();
const decodedPaths = new Set<string>();

/** Refresh signed URLs a few minutes before they expire. */
const REFRESH_SKEW_MS = 5 * 60_000;
/** Fallback TTL when the API omits expiresAt (must stay below signed URL lifetime). */
const FALLBACK_TTL_MS = 50 * 60_000;

function cacheKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

function isFresh(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() < entry.expiresAt - REFRESH_SKEW_MS;
}

export function getCachedStampUrl(path: string | null | undefined): string | null {
  const trimmed = path?.trim() || "";
  if (!trimmed) return null;
  const key = cacheKey("marking-stamps", trimmed);
  const hit = urlCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    urlCache.delete(key);
    return null;
  }
  if (!isFresh(hit)) return null;
  return hit.url;
}

export function isStampImageReady(path: string | null | undefined): boolean {
  const trimmed = path?.trim() || "";
  if (!trimmed) return false;
  return decodedPaths.has(trimmed) && Boolean(getCachedStampUrl(trimmed));
}

function writeCache(
  bucket: string,
  path: string,
  url: string,
  expiresAt?: number,
) {
  urlCache.set(cacheKey(bucket, path), {
    url,
    expiresAt: expiresAt ?? Date.now() + FALLBACK_TTL_MS,
  });
}

async function fetchSignedUrl(
  bucket: string,
  path: string,
): Promise<string | null> {
  const cached = getCachedStampUrl(path);
  if (cached && bucket === "marking-stamps") return cached;

  const key = cacheKey(bucket, path);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch("/api/files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, path }),
      });
      const json = (await res.json()) as {
        url?: string;
        expiresAt?: number;
        expiresIn?: number;
      };
      if (json.url) {
        const expiresAt =
          typeof json.expiresAt === "number"
            ? json.expiresAt
            : typeof json.expiresIn === "number"
              ? Date.now() + json.expiresIn * 1000
              : undefined;
        writeCache(bucket, path, json.url, expiresAt);
        return json.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

function decodeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Prefetch signed URLs and decode images for the marking session. */
export async function prefetchStampUrls(
  paths: Array<string | null | undefined>,
): Promise<string[]> {
  const unique = [
    ...new Set(
      paths
        .map((p) => p?.trim())
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  if (!unique.length) return [];

  const missing = unique.filter((p) => !getCachedStampUrl(p));
  if (missing.length) {
    try {
      const res = await fetch("/api/files/signed-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "marking-stamps",
          paths: missing,
        }),
      });
      const json = (await res.json()) as {
        urls?: Record<string, string>;
        expiresAt?: number;
        expiresIn?: number;
      };
      const expiresAt =
        typeof json.expiresAt === "number"
          ? json.expiresAt
          : typeof json.expiresIn === "number"
            ? Date.now() + json.expiresIn * 1000
            : undefined;
      if (json.urls) {
        for (const [path, url] of Object.entries(json.urls)) {
          if (url) writeCache("marking-stamps", path, url, expiresAt);
        }
      }
    } catch {
      await Promise.all(
        missing.map((path) => fetchSignedUrl("marking-stamps", path)),
      );
    }
  }

  const ready: string[] = [];
  await Promise.all(
    unique.map(async (path) => {
      const url =
        getCachedStampUrl(path) ?? (await fetchSignedUrl("marking-stamps", path));
      if (!url) return;
      const ok = await decodeImage(url);
      if (ok) {
        decodedPaths.add(path);
        ready.push(path);
      }
    }),
  );
  return ready;
}

/** Loads a private marking-stamps object via signed URL. */
export function StampImage({
  storagePath,
  stamp,
  geometry,
  alt,
  className,
  opacity,
}: {
  storagePath?: string | null | undefined;
  stamp?: { storage_path?: string | null } | null;
  geometry?: Record<string, unknown> | null;
  alt: string;
  className?: string;
  /** 0–1 opacity override (placement snapshot or default). */
  opacity?: number;
}) {
  const snapshotPath =
    typeof geometry?.storage_path === "string" ? geometry.storage_path : null;
  const path = (snapshotPath || storagePath || stamp?.storage_path || "").trim();
  const [retryToken, setRetryToken] = useState(0);
  const [url, setUrl] = useState<string | null>(() =>
    path ? getCachedStampUrl(path) : null,
  );
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(() => isStampImageReady(path));

  const snapshotOpacity =
    typeof geometry?.opacity === "number"
      ? geometry.opacity
      : typeof opacity === "number"
        ? opacity
        : 1;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    void (async () => {
      const cached = getCachedStampUrl(path);
      if (cached && decodedPaths.has(path)) {
        if (!cancelled) {
          setUrl(cached);
          setReady(true);
          setFailed(false);
        }
        return;
      }
      const next = cached ?? (await fetchSignedUrl("marking-stamps", path));
      if (cancelled) return;
      if (!next) {
        setFailed(true);
        setReady(false);
        setUrl(null);
        return;
      }
      setUrl(next);
      const ok = await decodeImage(next);
      if (cancelled) return;
      if (ok) {
        decodedPaths.add(path);
        setReady(true);
        setFailed(false);
      } else {
        setFailed(true);
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, retryToken]);

  // Proactively refresh before signed URL expiry while mounted.
  useEffect(() => {
    if (!path) return;
    const key = cacheKey("marking-stamps", path);
    const entry = urlCache.get(key);
    if (!entry) return;
    const refreshIn = Math.max(5_000, entry.expiresAt - Date.now() - REFRESH_SKEW_MS);
    const timer = window.setTimeout(() => {
      void fetchSignedUrl("marking-stamps", path).then((next) => {
        if (next) setUrl(next);
      });
    }, refreshIn);
    return () => window.clearTimeout(timer);
  }, [path, url]);

  if (!path) {
    return (
      <span
        className={className}
        aria-label={`${alt} unavailable`}
        title="Stamp image unavailable"
      >
        —
      </span>
    );
  }

  if (failed) {
    return (
      <button
        type="button"
        className={className}
        aria-label={`${alt} unavailable, click to retry`}
        title="Stamp unavailable — retry"
        onClick={(e) => {
          e.stopPropagation();
          urlCache.delete(cacheKey("marking-stamps", path));
          decodedPaths.delete(path);
          setRetryToken((n) => n + 1);
        }}
      >
        —
      </button>
    );
  }

  if (!url || !ready) {
    return (
      <span
        className={className}
        aria-hidden
        style={{ display: "inline-block", visibility: "hidden" }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      draggable={false}
      style={{ opacity: Math.min(1, Math.max(0.1, snapshotOpacity)) }}
      onError={() => {
        decodedPaths.delete(path);
        urlCache.delete(cacheKey("marking-stamps", path));
        setFailed(true);
        setReady(false);
      }}
    />
  );
}
