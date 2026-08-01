import { describe, expect, it } from "vitest";
import { isEmbeddableVideo, parseVideoUrl } from "./video-embed";

describe("parseVideoUrl", () => {
  it("embeds YouTube watch URLs", () => {
    const parsed = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(isEmbeddableVideo(parsed)).toBe(true);
    if (isEmbeddableVideo(parsed)) {
      expect(parsed.kind).toBe("youtube");
      expect(parsed.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("embeds Vimeo URLs", () => {
    const parsed = parseVideoUrl("https://vimeo.com/123456789");
    expect(isEmbeddableVideo(parsed)).toBe(true);
    if (isEmbeddableVideo(parsed)) {
      expect(parsed.kind).toBe("vimeo");
      expect(parsed.embedUrl).toBe("https://player.vimeo.com/video/123456789");
    }
  });

  it("accepts direct MP4 URLs", () => {
    const parsed = parseVideoUrl("https://cdn.example.com/clip.mp4");
    expect(parsed.kind).toBe("direct");
  });

  it("rejects unsupported pages without inventing iframes", () => {
    const parsed = parseVideoUrl("https://example.com/not-a-video");
    expect(parsed.kind).toBe("unsupported");
    expect(parsed.reason.length).toBeGreaterThan(10);
  });

  it("requires Microsoft Stream embed URLs", () => {
    const page = parseVideoUrl("https://web.microsoftstream.com/video/abc");
    expect(page.kind).toBe("unsupported");
    const embed = parseVideoUrl(
      "https://web.microsoftstream.com/embed/video/abc",
    );
    expect(embed.kind).toBe("stream");
  });
});
