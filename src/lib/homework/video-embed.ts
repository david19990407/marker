export type EmbeddableVideo =
  | { kind: "youtube"; embedUrl: string; watchUrl: string }
  | { kind: "vimeo"; embedUrl: string; watchUrl: string }
  | { kind: "stream"; embedUrl: string; watchUrl: string }
  | { kind: "direct"; embedUrl: string; watchUrl: string }
  | { kind: "unsupported"; reason: string };

const YOUTUBE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO = /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i;
const STREAM =
  /(?:microsoftstream\.com|sharepoint\.com|web\.microsoftstream\.com).+/i;
const DIRECT = /\.(mp4|webm)(?:\?|#|$)/i;

export function parseVideoUrl(raw: string | null | undefined): EmbeddableVideo {
  const input = (raw ?? "").trim();
  if (!input) {
    return { kind: "unsupported", reason: "Enter a video URL" };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { kind: "unsupported", reason: "That does not look like a valid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { kind: "unsupported", reason: "Only http(s) video links are allowed" };
  }

  const href = url.toString();
  const yt = href.match(YOUTUBE);
  if (yt?.[1]) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}`,
      watchUrl: href,
    };
  }

  const vimeo = href.match(VIMEO);
  if (vimeo?.[1]) {
    return {
      kind: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
      watchUrl: href,
    };
  }

  if (STREAM.test(href) && /embed/i.test(href)) {
    return { kind: "stream", embedUrl: href, watchUrl: href };
  }
  if (STREAM.test(href)) {
    return {
      kind: "unsupported",
      reason:
        "Microsoft Stream links must be an embeddable player URL. Open the video’s embed options and paste that URL.",
    };
  }

  if (DIRECT.test(href) || url.pathname.toLowerCase().endsWith(".mp4") || url.pathname.toLowerCase().endsWith(".webm")) {
    return { kind: "direct", embedUrl: href, watchUrl: href };
  }

  return {
    kind: "unsupported",
    reason:
      "Supported: YouTube, Vimeo, embeddable Microsoft Stream, or a direct MP4/WebM URL.",
  };
}

export function isEmbeddableVideo(
  parsed: EmbeddableVideo,
): parsed is Exclude<EmbeddableVideo, { kind: "unsupported" }> {
  return parsed.kind !== "unsupported";
}
