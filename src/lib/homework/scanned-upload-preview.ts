import { PDFDocument, degrees } from "pdf-lib";

export type ScannedPreviewSource = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  rotation?: number;
};

/**
 * Build a normalised multi-page PDF from ordered image (and PDF) pages.
 * Original student bytes are never mutated — callers keep originals separately.
 */
export async function buildNormalisedMarkingPdf(
  sources: ScannedPreviewSource[],
): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  if (!sources.length) {
    throw new Error("No files provided for preview normalisation");
  }

  const out = await PDFDocument.create();
  let pageCount = 0;

  for (const source of sources) {
    const mime = source.mimeType.toLowerCase();
    const name = source.fileName.toLowerCase();
    const rotation = ((source.rotation ?? 0) % 360 + 360) % 360;

    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      const embedded = await PDFDocument.load(source.bytes, {
        ignoreEncryption: true,
      });
      const indices = embedded.getPageIndices();
      const copied = await out.copyPages(embedded, indices);
      for (const page of copied) {
        if (rotation) page.setRotation(degrees(rotation));
        out.addPage(page);
        pageCount += 1;
      }
      continue;
    }

    let image;
    if (mime === "image/png" || name.endsWith(".png")) {
      image = await out.embedPng(source.bytes);
    } else if (
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    ) {
      image = await out.embedJpg(source.bytes);
    } else {
      throw new Error(
        `Cannot normalise “${source.fileName}” (${source.mimeType}). Use PDF, JPG or PNG.`,
      );
    }

    const width = image.width;
    const height = image.height;
    const page = out.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    if (rotation) page.setRotation(degrees(rotation));
    pageCount += 1;
  }

  const pdfBytes = await out.save();
  return { pdfBytes, pageCount };
}
