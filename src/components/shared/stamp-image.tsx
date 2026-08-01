"use client";

import { useEffect, useState } from "react";

type CacheEntry = { url: string; expiresAt: number };

const urlCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

const CACHE_TTL_MS = 45_000;

function cacheKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

function readCache(bucket: string, path: string): string | null {
  const key = cacheKey(bucket, path);
  const hit = urlCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    urlCache.delete(key);
    return null;
  }
  return hit.url;
}

function writeCache(bucket: string, path: string, url: string) {
  urlCache.set(cacheKey(bucket, path), {
    url,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function fetchSignedUrl(
  bucket: string,
  path: string,
): Promise<string | null> {
  const cached = readCache(bucket, path);
  if (cached) return cached;

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
      const json = (await res.json()) as { url?: string };
      if (json.url) {
        writeCache(bucket, path, json.url);
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

/** Prefetch many stamp signed URLs in parallel for the marking session. */
export async function prefetchStampUrls(
  paths: Array<string | null | undefined>,
): Promise<void> {
  const unique = [
    ...new Set(
      paths
        .map((p) => p?.trim())
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  if (!unique.length) return;

  const missing = unique.filter((p) => !readCache("marking-stamps", p));
  if (!missing.length) return;

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
    };
    if (json.urls) {
      for (const [path, url] of Object.entries(json.urls)) {
        if (url) writeCache("marking-stamps", path, url);
      }
      return;
    }
  } catch {
    // Fall through to per-path fetch.
  }

  await Promise.all(
    missing.map((path) => fetchSignedUrl("marking-stamps", path)),
  );
}

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
  const [retryToken, setRetryToken] = useState(0);
  const [resolved, setResolved] = useState<{
    path: string;
    url: string | null;
    failed: boolean;
    token: number;
  }>(() => ({
    path,
    url: path ? readCache("marking-stamps", path) : null,
    failed: false,
    token: 0,
  }));

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    void fetchSignedUrl("marking-stamps", path).then((next) => {
      if (cancelled) return;
      setResolved({
        path,
        url: next,
        failed: !next,
        token: retryToken,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [path, retryToken]);

  const active =
    resolved.path === path && resolved.token === retryToken ? resolved : null;
  const cached = path ? readCache("marking-stamps", path) : null;
  const url = active?.url ?? cached;

  if (!path) {
    return (
      <span className={className} aria-label={alt} title={alt}>
        ★
      </span>
    );
  }

  if (active?.failed && !url) {
    return (
      <button
        type="button"
        className={className}
        aria-label={`${alt} (failed to load, click to retry)`}
        title="Retry loading stamp"
        onClick={(e) => {
          e.stopPropagation();
          setRetryToken((n) => n + 1);
        }}
      >
        ⚠
      </button>
    );
  }

  if (!url) {
    return (
      <span className={className} aria-label={alt} title={alt}>
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
      onError={() =>
        setResolved({ path, url: null, failed: true, token: retryToken })
      }
    />
  );
}
