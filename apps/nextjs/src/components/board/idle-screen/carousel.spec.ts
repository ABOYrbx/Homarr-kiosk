import { describe, expect, it } from "vitest";

import { classifyIdlePointer, getIdleLayerTarget } from "./carousel";

describe("idle carousel navigation", () => {
  it("moves left to music and right to widgets from the clock", () => {
    expect(getIdleLayerTarget("clock", -1)).toBe("music");
    expect(getIdleLayerTarget("clock", 1)).toBe("widgets");
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(getIdleLayerTarget("music", -1)).toBe("music");
    expect(getIdleLayerTarget("widgets", 1)).toBe("widgets");
  });

  it("treats short or mostly vertical pointer movement as a tap", () => {
    expect(classifyIdlePointer(20, 0)).toBeNull();
    expect(classifyIdlePointer(10, 80)).toBeNull();
    expect(classifyIdlePointer(-90, 10)).toBe(-1);
    expect(classifyIdlePointer(90, -10)).toBe(1);
  });
});
