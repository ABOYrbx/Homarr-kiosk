import { describe, expect, it } from "vitest";

import type { Board } from "@homarr/boards/layout-data";

import { getIdleWeatherInput } from "./idle-clock-surface";

const board = { items: [] } as unknown as Board;
const boardWithWeatherWidget = {
  items: [{ kind: "weather", options: { location: { latitude: 48.85, longitude: 2.35 } } }],
} as unknown as Board;

describe("idle clock weather location", () => {
  it("uses the configured idle weather location", () => {
    expect(
      getIdleWeatherInput(boardWithWeatherWidget, {
        idleScreenWeatherLocation: { name: "B", latitude: 46.9, longitude: 7.4 },
      }),
    ).toEqual({ latitude: 46.9, longitude: 7.4 });
  });

  it("falls back to the first weather/clock widget location and tolerates none", () => {
    expect(getIdleWeatherInput(boardWithWeatherWidget, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 48.85,
      longitude: 2.35,
    });
    expect(getIdleWeatherInput(board, { idleScreenWeatherLocation: null })).toBeNull();
  });

  it("falls back to a clock widget location", () => {
    const boardWithClockWidget = {
      items: [{ kind: "clock", options: { location: { latitude: 52.52, longitude: 13.405 } } }],
    } as unknown as Board;

    expect(getIdleWeatherInput(boardWithClockWidget, { idleScreenWeatherLocation: null })).toEqual({
      latitude: 52.52,
      longitude: 13.405,
    });
  });

  it("ignores widget locations without numeric coordinates", () => {
    const boardWithInvalidLocation = {
      items: [{ kind: "weather", options: { location: { latitude: "48.85", longitude: 2.35 } } }],
    } as unknown as Board;

    expect(getIdleWeatherInput(boardWithInvalidLocation, { idleScreenWeatherLocation: null })).toBeNull();
  });
});
