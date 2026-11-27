import { describe, expect, it } from "vitest";

import { parseIdleScreenWeatherLocation } from "../schema/idle-screen-location";

describe("idle screen weather location decoding", () => {
  it("decodes a valid stored location", () => {
    expect(parseIdleScreenWeatherLocation('{"name":"Paris","latitude":48.85341,"longitude":2.3488}')).toEqual({
      name: "Paris",
      latitude: 48.85341,
      longitude: 2.3488,
    });
  });

  it("returns null for absent or malformed JSON", () => {
    expect(parseIdleScreenWeatherLocation(null)).toBeNull();
    expect(parseIdleScreenWeatherLocation("{")).toBeNull();
    expect(parseIdleScreenWeatherLocation("null")).toBeNull();
  });

  it.each([
    "[]",
    "{}",
    '{"name":"Paris","latitude":"48.85341","longitude":2.3488}',
    '{"name":"Paris","latitude":91,"longitude":2.3488}',
    '{"name":"Paris","latitude":-91,"longitude":2.3488}',
    '{"name":"Paris","latitude":48.85341,"longitude":181}',
    '{"name":"Paris","latitude":48.85341,"longitude":-181}',
  ])("returns null for an invalid stored shape or range: %s", (value) => {
    expect(parseIdleScreenWeatherLocation(value)).toBeNull();
  });
});
