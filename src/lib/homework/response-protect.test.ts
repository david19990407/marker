import { describe, expect, it } from "vitest";
import { shouldSkipStructuredUpsert } from "./response-protect";

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
