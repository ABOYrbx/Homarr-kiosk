import { describe, expect, it } from "vitest";

import { getMusicPaneState } from "./music-pane";

describe("music pane state", () => {
  it("reports missing configuration, an idle track and a ready track", () => {
    expect(getMusicPaneState({ integrationId: null, entityId: null, entity: null, hasArtwork: false })).toBe(
      "not-configured",
    );
    expect(
      getMusicPaneState({
        integrationId: "ha",
        entityId: "media_player.x",
        entity: { state: "idle" },
        hasArtwork: false,
      }),
    ).toBe("no-track");
    expect(
      getMusicPaneState({
        integrationId: "ha",
        entityId: "media_player.x",
        entity: { state: "playing" },
        hasArtwork: true,
      }),
    ).toBe("ready");
    expect(
      getMusicPaneState({
        integrationId: "ha",
        entityId: "media_player.x",
        entity: { state: "playing" },
        hasArtwork: false,
      }),
    ).toBe("ready");
  });

  it("reports no track when the configured entity is unavailable", () => {
    expect(
      getMusicPaneState({ integrationId: "ha", entityId: "media_player.x", entity: null, hasArtwork: false }),
    ).toBe("no-track");
  });

  it("keeps a paused track with a title ready", () => {
    expect(
      getMusicPaneState({
        integrationId: "ha",
        entityId: "media_player.x",
        entity: { state: "paused", attributes: { mediaTitle: "Song" } },
        hasArtwork: false,
      }),
    ).toBe("ready");
  });
});
