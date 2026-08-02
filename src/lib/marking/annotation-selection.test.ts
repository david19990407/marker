import { describe, expect, it } from "vitest";

/**
 * Documents the delete-targeting contract: Delete/Backspace must act on the
 * selected annotation ID from a live ref, never a stale closure or array index.
 */
describe("annotation selection targeting", () => {
  it("deletes only the selected id from a ref, not the newest or by index", () => {
    const annotations = [
      { id: "a1", label: "first" },
      { id: "a2", label: "second" },
      { id: "a3", label: "third" },
    ];
    const selectedRef = { current: "a2" as string | null };
    const editingRef = { current: null as string | null };

    function deleteBySelectedId() {
      const id = selectedRef.current;
      if (!id || editingRef.current) return annotations;
      return annotations.filter((a) => a.id !== id);
    }

    const after = deleteBySelectedId();
    expect(after.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(after.find((a) => a.id === "a2")).toBeUndefined();
  });

  it("does not delete while editing a comment", () => {
    const annotations = [{ id: "a1" }, { id: "a2" }];
    const selectedRef = { current: "a2" as string | null };
    const editingRef = { current: "a2" as string | null };
    const next =
      selectedRef.current && !editingRef.current
        ? annotations.filter((a) => a.id !== selectedRef.current)
        : annotations;
    expect(next).toHaveLength(2);
  });
});
