import { describe, expect, it } from "vitest";
import {
  maxClientVersionFromRows,
  pickAuthoritativeResponsesByQuestion,
  shouldSkipStructuredUpsert,
  structuredResponseFingerprint,
  structuredUpsertSkipReason,
} from "./response-protect";

describe("shouldSkipStructuredUpsert", () => {
  it("rejects older client versions", () => {
    expect(
      shouldSkipStructuredUpsert({
        incomingEmpty: false,
        existingPopulated: true,
        incomingVersion: 2,
        existingVersion: 5,
      }),
    ).toBe(true);
    expect(
      structuredUpsertSkipReason({
        incomingEmpty: false,
        existingPopulated: true,
        incomingVersion: 2,
        existingVersion: 5,
      }),
    ).toBe("stale_version");
  });

  it("rejects empty overwrite of populated answers without a newer version", () => {
    expect(
      shouldSkipStructuredUpsert({
        incomingEmpty: true,
        existingPopulated: true,
        incomingVersion: null,
        existingVersion: 3,
      }),
    ).toBe(true);
    expect(
      shouldSkipStructuredUpsert({
        incomingEmpty: true,
        existingPopulated: true,
        incomingVersion: 3,
        existingVersion: 3,
      }),
    ).toBe(true);
    expect(
      structuredUpsertSkipReason({
        incomingEmpty: true,
        existingPopulated: true,
        incomingVersion: 3,
        existingVersion: 3,
      }),
    ).toBe("empty_overwrite");
  });

  it("allows explicit clear when client version is newer", () => {
    expect(
      shouldSkipStructuredUpsert({
        incomingEmpty: true,
        existingPopulated: true,
        incomingVersion: 4,
        existingVersion: 3,
      }),
    ).toBe(false);
  });

  it("allows newer non-empty writes", () => {
    expect(
      shouldSkipStructuredUpsert({
        incomingEmpty: false,
        existingPopulated: true,
        incomingVersion: 6,
        existingVersion: 5,
      }),
    ).toBe(false);
  });
});

describe("response protect helpers", () => {
  it("fingerprints MCQ option ids stably without labels", () => {
    expect(
      structuredResponseFingerprint({
        text_value: "Paris",
        json_value: { kind: "mcq", option_ids: ["b", "a"] },
      }),
    ).toBe(
      structuredResponseFingerprint({
        text_value: "Paris",
        json_value: { kind: "mcq", option_ids: ["a", "b"] },
      }),
    );
  });

  it("reads max client version from rows", () => {
    expect(
      maxClientVersionFromRows([
        { client_version: 2 },
        { client_version: 9 },
        { client_version: null },
      ]),
    ).toBe(9);
  });

  it("picks latest row by version then updated_at", () => {
    const picked = pickAuthoritativeResponsesByQuestion([
      {
        id: "a",
        question_id: "q",
        client_version: 4,
        updated_at: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "b",
        question_id: "q",
        client_version: 5,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(picked.get("q")?.id).toBe("b");
  });
});
