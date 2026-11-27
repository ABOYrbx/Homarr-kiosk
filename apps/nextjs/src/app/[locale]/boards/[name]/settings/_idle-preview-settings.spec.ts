import { describe, expect, it } from "vitest";

import { toIdleWeatherLocation } from "./_idle-preview-settings";

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
