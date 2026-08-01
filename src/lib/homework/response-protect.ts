/**
 * Guards structured response upserts against stale / empty client snapshots.
 * A status transition must never clear answers; empty clears require a newer
 * client_version (explicit delete while editable).
 */

export function shouldSkipStructuredUpsert(input: {
  incomingEmpty: boolean;
  existingPopulated: boolean;
  incomingVersion: number | null;
  existingVersion: number;
}): boolean {
  const {
    incomingEmpty,
    existingPopulated,
    incomingVersion,
    existingVersion,
  } = input;

  if (
    incomingVersion != null &&
    existingVersion > 0 &&
    incomingVersion < existingVersion
  ) {
    return true;
  }

  if (incomingEmpty && existingPopulated) {
    if (incomingVersion == null || incomingVersion <= existingVersion) {
      return true;
    }
  }

  return false;
}
