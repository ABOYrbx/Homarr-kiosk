import { describe, expect, test } from "vitest";

import type { HaAttributes, HaDomain, HaEntity } from "../types";
import { getTheme } from "./theme";

const entity = (domain: HaDomain, state: string, attributes: HaAttributes = {}): HaEntity => ({
  id: `${domain}.test`,
  domain,
  name: "Test entity",
  areaId: null,
  state,
  icon: null,
  deviceClass: null,
  unit: null,
  lastChanged: 1_000,
  attributes,
  history: null,
});

describe("getTheme", () => {
  test("boring palette derives a light accent from entity state instead of the instance primary color", () => {
    const theme = getTheme(entity("light", "on", { brightness: 77, colorMode: "brightness" }), "boring");

    expect(theme.accent).toBe("var(--mantine-color-yellow-filled)");
    expect(theme.accent).not.toContain("primary-color");
  });

  test("boring palette uses the reported RGB colour of a light", () => {
    const theme = getTheme(entity("light", "on", { rgbColor: [99, 255, 159], colorMode: "hs" }), "boring");

    expect(theme.accent).toBe("rgb(99, 255, 159)");
  });

  test("boring palette colours other domains by state", () => {
    const theme = getTheme(entity("cover", "open", { position: 70 }), "boring");

    expect(theme.accent).toBe("var(--mantine-color-violet-filled)");
  });
});
