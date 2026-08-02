import { describe, expect, it } from "vitest";
import {
  stampAnnotationChrome,
  stampChromeIsInvisible,
} from "./stamp-annotation-chrome";

describe("stamp annotation chrome", () => {
  it("renders a deselected PNG stamp with no border, outline, background or shadow", () => {
    const style = stampAnnotationChrome(false);
    expect(style.border).toBe("none");
    expect(style.outline).toBe("none");
    expect(style.backgroundColor).toBe("transparent");
    expect(style.boxShadow).toBe("none");
    expect(stampChromeIsInvisible(style)).toBe(true);
  });

  it("shows a temporary dashed outline only while selected", () => {
    const selected = stampAnnotationChrome(true);
    expect(selected.outline).toMatch(/dashed/);
    expect(selected.border).toBe("none");
    expect(selected.boxShadow).toBe("none");
    expect(selected.backgroundColor).toBe("transparent");
    expect(selected.background).toBe("transparent");

    const deselected = stampAnnotationChrome(false);
    expect(deselected.outline).toBe("none");
    expect(deselected.outlineOffset).toBe(0);
    expect(stampChromeIsInvisible(deselected)).toBe(true);
  });
});
