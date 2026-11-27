import { describe, expect, it } from "vitest";

import { toIdleWeatherLocation } from "./_idle-preview-settings";

describe("toIdleWeatherLocation", () => {
  it("maps a city search result to the stored idle weather location", () => {
    expect(
      toIdleWeatherLocation({
        id: 1,
        name: "Bern",
        country: "CH",
        latitude: 46.95,
        longitude: 7.45,
        population: 100,
      }),
    ).toEqual({ name: "Bern", latitude: 46.95, longitude: 7.45 });
  });
});
