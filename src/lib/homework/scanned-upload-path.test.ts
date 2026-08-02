import { describe, expect, it } from "vitest";
import {
  buildStudentUploadPath,
  isScannedUploadBusyPhase,
  isStudentOwnedStoragePath,
  scannedUploadPhaseLabel,
} from "@/lib/homework/scanned-upload-path";

describe("buildStudentUploadPath", () => {
  it("puts the student id in the first folder for storage RLS", () => {
    const path = buildStudentUploadPath({
      studentId: "student-1",
      assignmentId: "assign-1",
      submissionId: "sub-1",
      blockId: "block-1",
      version: 2,
      fileId: "file-1",
      fileName: "Essay Final.pdf",
    });
    expect(path.split("/")[0]).toBe("student-1");
    expect(path).toContain("/v2/file-1/");
    expect(path.endsWith("Essay_Final.pdf")).toBe(true);
  });

  it("sanitises path-traversal fragments in file names", () => {
    const path = buildStudentUploadPath({
      studentId: "student-1",
      assignmentId: "assign-1",
      submissionId: "sub-1",
      blockId: "block-1",
      version: 1,
      fileId: "file-1",
      fileName: "../../evil.pdf",
    });
    expect(path.includes("..")).toBe(false);
    expect(path.startsWith("student-1/")).toBe(true);
  });
});

describe("isStudentOwnedStoragePath", () => {
  it("accepts only paths under the student folder", () => {
    expect(
      isStudentOwnedStoragePath("student-1/a/b/file.pdf", "student-1"),
    ).toBe(true);
    expect(
      isStudentOwnedStoragePath("other/student-1/a/file.pdf", "student-1"),
    ).toBe(false);
  });
});

describe("scanned upload phase labels", () => {
  it("shows progress while uploading", () => {
    expect(scannedUploadPhaseLabel("uploading", 62)).toBe("Uploading, 62%");
    expect(scannedUploadPhaseLabel("uploaded", 100)).toBe("Uploaded");
    expect(scannedUploadPhaseLabel("processing", 100)).toBe(
      "Preparing preview…",
    );
    expect(scannedUploadPhaseLabel("ready", 100)).toBe("Ready");
  });

  it("labels queued as Queued, not Waiting", () => {
    expect(scannedUploadPhaseLabel("queued", 0)).toBe("Queued");
  });

  it("treats preview processing as not busy for submit gating", () => {
    expect(isScannedUploadBusyPhase("uploading")).toBe(true);
    expect(isScannedUploadBusyPhase("queued")).toBe(true);
    expect(isScannedUploadBusyPhase("stalled")).toBe(true);
    expect(isScannedUploadBusyPhase("processing")).toBe(false);
    expect(isScannedUploadBusyPhase("uploaded")).toBe(false);
    expect(isScannedUploadBusyPhase("ready")).toBe(false);
  });
});
