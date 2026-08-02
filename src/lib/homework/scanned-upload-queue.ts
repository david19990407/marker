/**
 * Stable helpers for the scanned-homework upload queue worker.
 * Keeps concurrency accounting independent of React render timing.
 */

export const SCANNED_UPLOAD_CONCURRENCY = 2;
export const SCANNED_UPLOAD_START_TIMEOUT_MS = 5_000;

export type QueuePumpState = {
  queue: string[];
  activeCount: number;
  inFlight: Set<string>;
};

/** Start up to `concurrency` jobs. Returns ids that should begin uploading. */
export function takeNextUploadJobs(
  state: QueuePumpState,
  concurrency = SCANNED_UPLOAD_CONCURRENCY,
): string[] {
  const started: string[] = [];
  while (state.activeCount < concurrency && state.queue.length > 0) {
    const nextId = state.queue.shift()!;
    if (state.inFlight.has(nextId)) continue;
    state.inFlight.add(nextId);
    state.activeCount += 1;
    started.push(nextId);
  }
  return started;
}

/** Release a finished/failed/cancelled job and return whether more work remains. */
export function releaseUploadJob(
  state: QueuePumpState,
  localId: string,
): void {
  state.inFlight.delete(localId);
  state.activeCount = Math.max(0, state.activeCount - 1);
}

/** Re-queue an id that could not start (e.g. missing file) without leaking the lock. */
export function requeueUploadJob(
  state: QueuePumpState,
  localId: string,
): void {
  releaseUploadJob(state, localId);
  if (!state.queue.includes(localId) && !state.inFlight.has(localId)) {
    state.queue.unshift(localId);
  }
}
