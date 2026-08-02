import { describe, expect, it } from "vitest";
import {
  normaliseStorageObjectPath,
  pickPrimaryScannedFile,
  resolveScannedDisplayPath,
  selectLatestActiveScannedFiles,
  type ScannedFileLike,
} from "./scanned-file-resolve";

function file(overrides: Partial<ScannedFileLike>): ScannedFileLike {
  return {
    id: "f1",
    block_id: "block-1",
    submission_id: "sub-1",
    submission_version: 1,
    original_storage_path: "student/a/sub/block/v1/f1/Essay.pdf",
    preview_storage_path: "student/a/sub/block/v1/f1/Essay.pdf",
    original_file_name: "Essay.pdf",
    mime_type: "application/pdf",
    display_order: 0,
    is_active_version: true,
    storage_bucket: "student-submissions",
    ...overrides,
  };
}

describe("scanned file resolve", () => {
  it("stores and resolves canonical path without reconstructing from filename", () => {
    const row = file({
      original_file_name: "My Essay Final!!.pdf",
      original_storage_path: "student/a/sub/block/v1/f1/My_Essay_Final_.pdf",
      preview_storage_path: "student/a/sub/block/v1/f1/My_Essay_Final_.pdf",
    });
    const resolved = resolveScannedDisplayPath(row);
    expect(resolved.path).toBe("student/a/sub/block/v1/f1/My_Essay_Final_.pdf");
    expect(resolved.path.includes("My Essay")).toBe(false);
    expect(resolved.fileName).toBe("My Essay Final!!.pdf");
    expect(resolved.bucket).toBe("student-submissions");
  });

  it("strips accidental bucket prefixes from stored paths", () => {
    expect(
      normaliseStorageObjectPath(
        "student-submissions/student/a/file.pdf",
        "student-submissions",
      ),
    ).toBe("student/a/file.pdf");
  });

  it("selects the latest active submission version after resubmit", () => {
    const files = [
      file({
        id: "old",
        submission_version: 1,
        is_active_version: false,
        original_storage_path: "student/old.pdf",
      }),
      file({
        id: "new",
        submission_version: 2,
        display_order: 0,
        original_storage_path: "student/new.pdf",
        preview_storage_path: "student/new.pdf",
      }),
    ];
    const latest = selectLatestActiveScannedFiles(files, "block-1");
    expect(latest).toHaveLength(1);
    expect(latest[0]!.id).toBe("new");
    expect(pickPrimaryScannedFile(files, "block-1")!.original_storage_path).toBe(
      "student/new.pdf",
    );
  });

  it("uses combined preview only when it differs from the original", () => {
    const combined = resolveScannedDisplayPath(
      file({
        preview_storage_path: "student/a/sub/block/v1/marking-preview.pdf",
      }),
    );
    expect(combined.usesCombinedPreview).toBe(true);
    expect(combined.path.endsWith("marking-preview.pdf")).toBe(true);
    expect(combined.downloadPath).toContain("Essay.pdf");

    const same = resolveScannedDisplayPath(
      file({
        preview_storage_path: "student/a/sub/block/v1/f1/Essay.pdf",
      }),
    );
    expect(same.usesCombinedPreview).toBe(false);
    expect(same.path).toBe(same.downloadPath);
  });
});
