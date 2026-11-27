import { describe, expect, it } from "vitest";

import { formatWidgetScale, toIdleWeatherLocation } from "./_idle-preview-settings";

describe("toIdleWeatherLocation", () => {
  it("accepts a minimal city location", () => {
    expect(toIdleWeatherLocation({ name: "Bern", latitude: 46.95, longitude: 7.45 })).toEqual({
      name: "Bern",
      latitude: 46.95,
      longitude: 7.45,
    });
  });

  it("maps a city search result to the stored idle weather location", () => {
    const city = {
      id: 1,
      name: "Bern",
      country: "CH",
      latitude: 46.95,
      longitude: 7.45,
      population: 100,
    };

    expect(toIdleWeatherLocation(city)).toEqual({ name: "Bern", latitude: 46.95, longitude: 7.45 });
  });
});

describe("formatWidgetScale", () => {
  it("formats a fractional scale as a percentage", () => {
    expect(formatWidgetScale(1.35)).toBe("135 %");
  });

  it("formats the default scale as 100 %", () => {
    expect(formatWidgetScale(1)).toBe("100 %");
  });
});
