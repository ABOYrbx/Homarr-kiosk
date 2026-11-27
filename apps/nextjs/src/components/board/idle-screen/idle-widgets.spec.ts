import { describe, expect, it } from "vitest";

import { clampIdlePan, getIdleWidgetScale } from "./idle-widgets";

describe("getIdleWidgetScale", () => {
  it("multiplies the fit scale with the user scale", () => {
    expect(getIdleWidgetScale({ fitScale: 0.8, userScale: 1.5 })).toBeCloseTo(1.2);
  });

  it("clamps the result to the supported range", () => {
    expect(getIdleWidgetScale({ fitScale: 0.8, userScale: 99 })).toBe(2);
    expect(getIdleWidgetScale({ fitScale: 0.1, userScale: 0.5 })).toBe(0.2);
  });

  it("falls back to the unscaled surface for non-finite input", () => {
    expect(getIdleWidgetScale({ fitScale: Number.NaN, userScale: 1.5 })).toBe(1);
    expect(getIdleWidgetScale({ fitScale: 0.8, userScale: Number.POSITIVE_INFINITY })).toBe(1);
  });
});

describe("clampIdlePan", () => {
  it("allows offsets that stay within the overflow", () => {
    expect(clampIdlePan({ offset: 500, scaledSize: 2000, viewportSize: 1000, padding: 32 })).toBe(500);
  });

  it("limits the offset to half of the overflow", () => {
    expect(clampIdlePan({ offset: 500, scaledSize: 1100, viewportSize: 1000, padding: 32 })).toBe(82);
    expect(clampIdlePan({ offset: -500, scaledSize: 1100, viewportSize: 1000, padding: 32 })).toBe(-82);
  });

  it("does not pan when the content fits the viewport", () => {
    expect(clampIdlePan({ offset: 100, scaledSize: 800, viewportSize: 1000, padding: 32 })).toBe(0);
  });

  it("returns zero for non-finite input", () => {
    expect(clampIdlePan({ offset: Number.NaN, scaledSize: 2000, viewportSize: 1000, padding: 32 })).toBe(0);
    expect(clampIdlePan({ offset: 100, scaledSize: Number.POSITIVE_INFINITY, viewportSize: 1000, padding: 32 })).toBe(
      0,
    );
  });
});
