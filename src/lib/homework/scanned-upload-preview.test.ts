import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildNormalisedMarkingPdf } from "@/lib/homework/scanned-upload-preview";

/** Minimal valid 1x1 PNG */
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("buildNormalisedMarkingPdf", () => {
  it("combines ordered PNG pages into one PDF", async () => {
    const { pdfBytes, pageCount } = await buildNormalisedMarkingPdf([
      {
        bytes: TINY_PNG,
        mimeType: "image/png",
        fileName: "page1.png",
        rotation: 0,
      },
      {
        bytes: TINY_PNG,
        mimeType: "image/png",
        fileName: "page2.png",
        rotation: 90,
      },
    ]);
    expect(pageCount).toBe(2);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("rejects empty sources", async () => {
    await expect(buildNormalisedMarkingPdf([])).rejects.toThrow(/No files/);
  });
});
