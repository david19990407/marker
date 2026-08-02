import { describe, expect, it } from "vitest";
import { ensureDraftSubmission } from "@/lib/homework/ensure-draft-submission";

function mockClient(opts: {
  existing?: Record<string, unknown> | null;
  created?: Record<string, unknown> | null;
  createError?: { message: string } | null;
  raced?: Record<string, unknown> | null;
}) {
  let selectCall = 0;
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      selectCall += 1;
                      if (selectCall === 1) {
                        return { data: opts.existing ?? null, error: null };
                      }
                      return { data: opts.raced ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert() {
          return {
            select() {
              return {
                async single() {
                  if (opts.createError) {
                    return { data: null, error: opts.createError };
                  }
                  return { data: opts.created ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

describe("ensureDraftSubmission", () => {
  it("returns an existing submission without inserting", async () => {
    const existing = { id: "s1", assignment_id: "a1", student_id: "u1", status: "draft" };
    const result = await ensureDraftSubmission(
      mockClient({ existing }),
      "a1",
      "u1",
    );
    expect(result.submission?.id).toBe("s1");
  });

  it("creates a draft when none exists", async () => {
    const created = { id: "s2", assignment_id: "a1", student_id: "u1", status: "draft" };
    const result = await ensureDraftSubmission(
      mockClient({ existing: null, created }),
      "a1",
      "u1",
    );
    expect(result.submission?.id).toBe("s2");
  });

  it("recovers from a unique-constraint race", async () => {
    const raced = { id: "s3", assignment_id: "a1", student_id: "u1", status: "draft" };
    const result = await ensureDraftSubmission(
      mockClient({
        existing: null,
        createError: { message: "duplicate key value violates unique constraint" },
        raced,
      }),
      "a1",
      "u1",
    );
    expect(result.submission?.id).toBe("s3");
  });
});
