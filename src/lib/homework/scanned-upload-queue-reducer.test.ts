import { describe, expect, it } from "vitest";
import {
  UPLOAD_CONCURRENCY,
  buildUploadQueueItems,
  createEmptyUploadQueue,
  pickNextUploadJobs,
  selectRunnableQueuedItems,
  uploadQueuePhaseLabel,
  uploadQueueReducer,
  type UploadQueueItem,
  type UploadQueueSnapshot,
} from "@/lib/homework/scanned-upload-queue-reducer";

function fakeFile(name: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("scanned upload queue reducer", () => {
  it("queues files and exposes them to the worker without waiting for a render", () => {
    let state = createEmptyUploadQueue();
    // Simulate the unsafe pattern's "previous empty state".
    const staleEmpty: UploadQueueSnapshot = createEmptyUploadQueue();
    expect(selectRunnableQueuedItems(staleEmpty)).toHaveLength(0);

    const items = buildUploadQueueItems({
      files: [fakeFile("Harrow.pdf", 1_300_000)],
      blockId: "block-1",
      submissionId: "sub-1",
      startingOrder: 0,
    });
    state = uploadQueueReducer(state, { type: "QUEUE_FILES", items });

    // Worker must read the NEW snapshot / new items, never the stale empty one.
    const jobs = pickNextUploadJobs(state, new Set(), UPLOAD_CONCURRENCY);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.file).toBeInstanceOf(File);
    expect(jobs[0]!.name).toBe("Harrow.pdf");
    expect(uploadQueuePhaseLabel(jobs[0]!.state, 0)).toBe("Queued");
  });

  it("transitions preparing → uploading → uploaded → ready", () => {
    let state = createEmptyUploadQueue();
    const [item] = buildUploadQueueItems({
      files: [fakeFile("a.pdf")],
      blockId: "b",
      submissionId: "s",
      startingOrder: 0,
    });
    state = uploadQueueReducer(state, { type: "QUEUE_FILES", items: [item!] });
    state = uploadQueueReducer(state, {
      type: "START_PREPARING",
      clientId: item!.clientId,
    });
    expect(state.items[0]!.state).toBe("preparing");
    expect(uploadQueuePhaseLabel("preparing", 0)).toBe("Preparing upload");

    state = uploadQueueReducer(state, {
      type: "START_UPLOAD",
      clientId: item!.clientId,
      storagePath: "student/path.pdf",
    });
    state = uploadQueueReducer(state, {
      type: "SET_PROGRESS",
      clientId: item!.clientId,
      progress: 47,
    });
    expect(uploadQueuePhaseLabel(state.items[0]!.state, 47)).toBe(
      "Uploading, 47%",
    );

    state = uploadQueueReducer(state, {
      type: "UPLOAD_COMPLETE",
      clientId: item!.clientId,
      storagePath: "student/path.pdf",
    });
    state = uploadQueueReducer(state, {
      type: "METADATA_COMPLETE",
      clientId: item!.clientId,
      databaseFileId: "db-1",
    });
    state = uploadQueueReducer(state, {
      type: "READY",
      clientId: item!.clientId,
    });
    expect(state.items[0]!.state).toBe("ready");
    expect(state.items[0]!.databaseFileId).toBe("db-1");
  });

  it("clears the active lock path after failure so retry can start", () => {
    let state = createEmptyUploadQueue();
    const items = buildUploadQueueItems({
      files: [fakeFile("a.pdf")],
      blockId: "b",
      submissionId: "s",
      startingOrder: 0,
    });
    state = uploadQueueReducer(state, { type: "QUEUE_FILES", items });
    const id = items[0]!.clientId;
    const active = new Set<string>([id]);
    // While in-flight, do not pick again.
    expect(pickNextUploadJobs(state, active, 2)).toHaveLength(0);

    state = uploadQueueReducer(state, {
      type: "FAILED",
      clientId: id,
      error: "The submission could not be prepared. Retry.",
    });
    active.delete(id); // finally block clears lock
    state = uploadQueueReducer(state, { type: "RETRY", clientId: id });
    // Retry needs the File — METADATA_COMPLETE clears it; FAILED keeps it.
    expect(state.items[0]!.file).toBeInstanceOf(File);
    expect(pickNextUploadJobs(state, active, 2).map((j) => j.clientId)).toEqual(
      [id],
    );
  });

  it("does not label queued as Waiting", () => {
    expect(uploadQueuePhaseLabel("queued", 0)).toBe("Queued");
    expect(uploadQueuePhaseLabel("failed", 0)).toBe("Upload failed, Retry");
  });

  it("respects concurrency of two", () => {
    let state = createEmptyUploadQueue();
    const items = buildUploadQueueItems({
      files: [fakeFile("a.pdf"), fakeFile("b.pdf"), fakeFile("c.pdf")],
      blockId: "b",
      submissionId: "s",
      startingOrder: 0,
    });
    state = uploadQueueReducer(state, { type: "QUEUE_FILES", items });
    const first = pickNextUploadJobs(state, new Set(), UPLOAD_CONCURRENCY);
    expect(first).toHaveLength(2);
    const active = new Set(first.map((j) => j.clientId));
    expect(pickNextUploadJobs(state, active, UPLOAD_CONCURRENCY - active.size)).toHaveLength(
      0,
    );
  });
});

describe("reproduction: stale empty queue must not starve the worker", () => {
  it("documents the previous bug and proves the new path", () => {
    // OLD BUG: setItems(additions); pumpQueue() reads itemsRef from prior render.
    const itemsRefStale: UploadQueueItem[] = [];
    const queuedId = "client-1";
    // Worker shifts queue and increments activeCount, then looks up itemsRef:
    const lookedUp = itemsRefStale.find((i) => i.clientId === queuedId);
    expect(lookedUp).toBeUndefined(); // <-- this is why Waiting stuck forever

    // NEW PATH: worker receives File from the reducer action payload / new state.
    let state = createEmptyUploadQueue();
    const built = buildUploadQueueItems({
      files: [fakeFile("essay.pdf", 1_048_576)],
      blockId: "block",
      submissionId: "sub",
      startingOrder: 0,
    });
    state = uploadQueueReducer(state, { type: "QUEUE_FILES", items: built });
    const jobs = pickNextUploadJobs(state, new Set(), 2);
    expect(jobs[0]!.file?.size).toBe(1_048_576);
    expect(jobs[0]!.state).toBe("queued");
  });
});
