import { describe, expect, it } from "vitest";
import {
  createBlock,
  normalizeMediaConfig,
  normalizeNumericConfig,
  structureToPayload,
} from "./structure";

describe("numeric and media block config", () => {
  it("persists numeric unit, decimals and accepted range in payload", () => {
    const block = createBlock("numeric");
    block.content = "Measure the length";
    block.prompt = "Enter your reading";
    block.min_value = 0;
    block.max_value = 100;
    block.marking_mode = "automatic";
    block.correct_answer = "12.5";
    block.numericConfig = normalizeNumericConfig({
      allow_decimals: true,
      decimal_places: 1,
      unit: "cm",
      correct_min: 12,
      correct_max: 13,
    });

    const [section] = structureToPayload([
      {
        _id: "s1",
        title: "Practical",
        blocks: [block],
        subsections: [],
      },
    ]);
    const payload = section.blocks[0] as Record<string, unknown>;
    const config = payload.config as Record<string, unknown>;
    expect(config.numeric).toMatchObject({
      allow_decimals: true,
      decimal_places: 1,
      unit: "cm",
      correct_min: 12,
      correct_max: 13,
    });
    expect(payload.correct_answer).toMatchObject({
      value: "12.5",
      min: 12,
      max: 13,
      unit: "cm",
    });
  });

  it("normalises media upload metadata for image blocks", () => {
    const media = normalizeMediaConfig({
      storage_path: "teacher/a/blocks/image/x.png",
      file_name: "diagram.png",
      mime_type: "image/png",
      file_size: 1200,
      alt_text: "A labelled diagram",
      caption: "Figure 1",
      alignment: "left",
      display_size: "medium",
      allow_download: false,
    });
    expect(media.storage_path).toBe("teacher/a/blocks/image/x.png");
    expect(media.file_name).toBe("diagram.png");
    expect(media.alt_text).toBe("A labelled diagram");
    expect(media.allow_download).toBe(false);
    expect(media.alignment).toBe("left");
  });

  it("creates media config defaults for resource blocks", () => {
    const image = createBlock("image");
    const video = createBlock("embedded_video");
    const download = createBlock("downloadable_resource");
    expect(image.mediaConfig?.display_size).toBe("large");
    expect(video.mediaConfig).toBeTruthy();
    expect(download.mediaConfig?.allow_download).toBe(true);
  });
});
