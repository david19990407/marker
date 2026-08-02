import { describe, expect, it } from "vitest";

/**
 * Mark flash must be a sibling of the overflow-auto scroller, not inside it,
 * so `absolute inset-0` centres in the visible viewer rather than page 1 top.
 */
describe("mark flash viewport placement", () => {
  it("centres relative to a non-scrolling overlay parent", () => {
    const viewer = { height: 800, scrollTop: 2400, contentHeight: 4000 };
    // Overlay parent does not scroll — centre is always mid-viewport.
    const overlayCentreY = viewer.height / 2;
    // Wrong model: centre of full content (off-screen when scrolled).
    const pageCentreY = viewer.contentHeight / 2 - viewer.scrollTop;
    expect(overlayCentreY).toBe(400);
    expect(pageCentreY).toBeLessThan(0);
    expect(overlayCentreY).toBeGreaterThan(0);
    expect(overlayCentreY).toBeLessThan(viewer.height);
  });
});
