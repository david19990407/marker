import { describe, expect, it } from "vitest";
import {
  requeueUploadJob,
  releaseUploadJob,
  takeNextUploadJobs,
  type QueuePumpState,
} from "@/lib/homework/scanned-upload-queue";

function fresh(): QueuePumpState {
  return { queue: [], activeCount: 0, inFlight: new Set() };
}

describe("scanned upload queue worker", () => {
  it("starts at most two jobs", () => {
    const state = fresh();
    state.queue.push("a", "b", "c");
    expect(takeNextUploadJobs(state)).toEqual(["a", "b"]);
    expect(state.activeCount).toBe(2);
    expect(state.queue).toEqual(["c"]);
    expect(takeNextUploadJobs(state)).toEqual([]);
  });

  it("continues after release", () => {
    const state = fresh();
    state.queue.push("a", "b", "c");
    takeNextUploadJobs(state);
    releaseUploadJob(state, "a");
    expect(takeNextUploadJobs(state)).toEqual(["c"]);
    expect(state.activeCount).toBe(2);
  });

  it("does not leak the lock when a job cannot start", () => {
    const state = fresh();
    state.queue.push("missing");
    const started = takeNextUploadJobs(state);
    expect(started).toEqual(["missing"]);
    requeueUploadJob(state, "missing");
    expect(state.activeCount).toBe(0);
    expect(state.queue).toEqual(["missing"]);
  });
});
