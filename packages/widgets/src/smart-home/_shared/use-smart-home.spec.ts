import type { SmartHomeEntity, SmartHomeSnapshot } from "@homarr/integrations/types";
import { describe, expect, test } from "vitest";

import { mergeSmartHomePatch } from "./use-smart-home";

const mediaPlayer = (overrides: Partial<SmartHomeEntity> = {}): SmartHomeEntity => ({
  id: "media_player.living_room",
  domain: "media_player",
  name: "Player",
  areaId: null,
  state: "playing",
  icon: null,
  deviceClass: null,
  stateClass: null,
  unit: null,
  lastChanged: 1_000,
  lastUpdated: 2_000,
  attributes: { mediaTitle: "Old track", mediaPosition: 10, mediaPositionUpdatedAt: 2_000 },
  ...overrides,
});

describe("mergeSmartHomePatch", () => {
  test("applies attribute changes when the patch keeps the same lastUpdated", () => {
    const snapshot: SmartHomeSnapshot = {
      entities: [mediaPlayer()],
      areas: [],
      updatedAt: 2_000,
    };
    const changed = mediaPlayer({
      attributes: { mediaTitle: "New track", mediaPosition: 40, mediaPositionUpdatedAt: 3_000 },
    });

    const merged = mergeSmartHomePatch(snapshot, { changed: [changed], removed: [] });

    expect(merged?.entities[0]?.attributes.mediaTitle).toBe("New track");
    expect(merged?.entities[0]?.attributes.mediaPosition).toBe(40);
  });

  test("keeps newer snapshot data when the patch is older", () => {
    const snapshot: SmartHomeSnapshot = {
      entities: [
        mediaPlayer({
          lastUpdated: 3_000,
          attributes: { mediaTitle: "Current", mediaPosition: 50 },
        }),
      ],
      areas: [],
      updatedAt: 3_000,
    };
    const changed = mediaPlayer({
      lastUpdated: 2_000,
      attributes: { mediaTitle: "Stale", mediaPosition: 10 },
    });

    const merged = mergeSmartHomePatch(snapshot, { changed: [changed], removed: [] });

    expect(merged?.entities[0]?.attributes.mediaTitle).toBe("Current");
  });
});
