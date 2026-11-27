import { describe, expect, it } from "vitest";

import { classifyIdlePointer, getIdleLayerTarget, isIdleNavigationEvent } from "./carousel";

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

describe("idle timer navigation activity", () => {
  it("keeps pointer and arrow activity from dismissing an open idle timer", () => {
    expect(isIdleNavigationEvent({ type: "pointerdown" })).toBe(true);
    expect(isIdleNavigationEvent({ type: "pointermove" })).toBe(true);
    expect(isIdleNavigationEvent({ type: "touchstart" })).toBe(true);
    expect(isIdleNavigationEvent({ type: "keydown", key: "ArrowLeft" })).toBe(true);
    expect(isIdleNavigationEvent({ type: "keydown", key: "ArrowRight" })).toBe(true);
  });

  it("does not suppress timer dismissal for taps, Escape, or other activity", () => {
    expect(isIdleNavigationEvent({ type: "pointerup" })).toBe(false);
    expect(isIdleNavigationEvent({ type: "click" })).toBe(false);
    expect(isIdleNavigationEvent({ type: "keydown", key: "Escape" })).toBe(false);
    expect(isIdleNavigationEvent({ type: "keydown", key: "a" })).toBe(false);
    expect(isIdleNavigationEvent({ type: "wheel" })).toBe(false);
  });
});
