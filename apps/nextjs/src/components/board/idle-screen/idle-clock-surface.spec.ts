import { describe, expect, it } from "vitest";

import type { Board } from "@homarr/boards/layout-data";

import { getIdleWeatherInput } from "./idle-clock-surface";

const board = { items: [] } as unknown as Board;
const boardWithWeatherWidget = {
  items: [{ kind: "weather", options: { location: { name: "Paris", latitude: 48.85, longitude: 2.35 } } }],
} as unknown as Board;

describe("idle clock weather location", () => {
  it("uses the configured idle weather location", () => {
    expect(
      getIdleWeatherInput(boardWithWeatherWidget, {
        idleScreenWeatherLocation: { name: "B", latitude: 46.9, longitude: 7.4 },
      }),
    ).toEqual({ latitude: 46.9, longitude: 7.4 });
  });

  it("falls back to the first weather/clock widget location and then to Paris", () => {
    expect(getIdleWeatherInput(boardWithWeatherWidget, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 48.85,
      longitude: 2.35,
    });
    expect(getIdleWeatherInput(board, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 48.85341,
      longitude: 2.3488,
    });
  });

  it("uses the Paris fallback for invalid configured coordinates", () => {
    expect(
      getIdleWeatherInput(board, {
        idleScreenWeatherLocation: { latitude: Number.NaN, longitude: 2.3488 },
      }),
    ).toEqual({ latitude: 48.85341, longitude: 2.3488 });
    expect(
      getIdleWeatherInput(board, {
        idleScreenWeatherLocation: { latitude: 91, longitude: 2.3488 },
      }),
    ).toEqual({ latitude: 48.85341, longitude: 2.3488 });
  });

  it("falls back to a clock widget weatherLocation", () => {
    const boardWithClockWidget = {
      items: [
        {
          kind: "clock",
          options: { weatherLocation: { name: "Berlin", latitude: 52.52, longitude: 13.405 } },
        },
      ],
    } as unknown as Board;

    expect(getIdleWeatherInput(boardWithClockWidget, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 52.52,
      longitude: 13.405,
    });
  });

  it("does not skip an invalid first candidate and uses the deterministic fallback", () => {
    const boardWithInvalidFirstLocation = {
      items: [
        {
          kind: "clock",
          options: { weatherLocation: { name: "Berlin", latitude: "52.52", longitude: 13.405 } },
        },
        {
          kind: "weather",
          options: { location: { name: "Paris", latitude: 48.85, longitude: 2.35 } },
        },
      ],
    } as unknown as Board;

    expect(getIdleWeatherInput(boardWithInvalidFirstLocation, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 48.85341,
      longitude: 2.3488,
    });
  });
});
