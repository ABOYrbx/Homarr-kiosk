import { describe, expect, it } from "vitest";

import type { RouterOutputs } from "@homarr/api";
import type { SmartHomeEntity } from "@homarr/integrations/types";

import { fromMusicAssistantNowPlaying, fromSmartHomeEntity } from "./music-track";
import type { MusicTrack } from "./music-track";
import { filterMusicTracks, parsePlayerId, pickPlayingTrack } from "./music-selection";

type NowPlaying = RouterOutputs["musicAssistant"]["nowPlaying"][number];

const track = (
  overrides: Partial<MusicTrack> & Pick<MusicTrack, "source" | "integrationId" | "playerId">,
): MusicTrack => ({
  playerName: overrides.playerId,
  title: "Song",
  state: "idle",
  ...overrides,
});

const fiveTracks: MusicTrack[] = [
  track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.kueche" }),
  track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.wohnzimmer" }),
  track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.alexa4" }),
  track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.alexa5" }),
  track({ source: "musicAssistant", integrationId: "b", playerId: "b8:27:eb:8a" }),
];

const smartHomeEntity = (overrides: Partial<SmartHomeEntity> = {}): SmartHomeEntity => ({
  id: "media_player.kueche",
  domain: "media_player",
  name: "Küche",
  areaId: null,
  state: "playing",
  icon: null,
  deviceClass: null,
  stateClass: null,
  unit: null,
  lastChanged: 0,
  lastUpdated: 0,
  attributes: {},
  ...overrides,
});

const nowPlaying = (overrides: Partial<NowPlaying> = {}): NowPlaying => ({
  queueId: "b8:27:eb:8a",
  name: "Küche",
  state: "playing",
  ...overrides,
});

describe("filterMusicTracks", () => {
  it("include keeps exactly the listed HA and MA player ids", () => {
    const filtered = filterMusicTracks(fiveTracks, "include", ["ha:a:media_player.kueche", "ma:b:b8:27:eb:8a"]);
    expect(filtered.map((candidate) => candidate.playerId)).toEqual(["media_player.kueche", "b8:27:eb:8a"]);
  });

  it("exclude drops two Alexas and keeps the other three of five players", () => {
    const filtered = filterMusicTracks(fiveTracks, "exclude", ["ha:a:media_player.alexa4", "ha:a:media_player.alexa5"]);
    expect(filtered.map((candidate) => candidate.playerId)).toEqual([
      "media_player.kueche",
      "media_player.wohnzimmer",
      "b8:27:eb:8a",
    ]);
  });

  it("keeps HA players with the same entity id under different integrations apart", () => {
    const candidates = [
      track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.kueche" }),
      track({ source: "homeAssistant", integrationId: "b", playerId: "media_player.kueche" }),
    ];
    expect(filterMusicTracks(candidates, "include", ["ha:b:media_player.kueche"])).toEqual([candidates[1]]);
  });
});

describe("pickPlayingTrack", () => {
  it("picks the playing track with the newest position timestamp", () => {
    const older = track({
      source: "homeAssistant",
      integrationId: "a",
      playerId: "media_player.kueche",
      state: "playing",
      positionUpdatedAt: 1_000,
    });
    const newer = track({
      source: "musicAssistant",
      integrationId: "b",
      playerId: "b8:27:eb:8a",
      state: "playing",
      positionUpdatedAt: 2_000,
    });
    const stale = track({
      source: "homeAssistant",
      integrationId: "a",
      playerId: "media_player.alexa4",
      state: "idle",
      positionUpdatedAt: 9_999,
    });
    expect(pickPlayingTrack([older, stale, newer])).toBe(newer);
  });

  it("returns undefined when no track is playing", () => {
    expect(
      pickPlayingTrack([
        track({ source: "homeAssistant", integrationId: "a", playerId: "media_player.kueche", state: "paused" }),
        track({ source: "musicAssistant", integrationId: "b", playerId: "queue", state: "idle" }),
      ]),
    ).toBeUndefined();
  });

  it("prefers HA over MA on equal timestamps", () => {
    const ma = track({
      source: "musicAssistant",
      integrationId: "b",
      playerId: "queue",
      state: "playing",
      positionUpdatedAt: 3_000,
    });
    const ha = track({
      source: "homeAssistant",
      integrationId: "a",
      playerId: "media_player.kueche",
      state: "playing",
      positionUpdatedAt: 3_000,
    });
    expect(pickPlayingTrack([ma, ha])).toBe(ha);
  });
});

describe("parsePlayerId", () => {
  it("splits only the first two colons so MA queue ids may contain colons", () => {
    expect(parsePlayerId("ma:b:b8:27:eb:8a")).toEqual({
      source: "ma",
      integrationId: "b",
      playerId: "b8:27:eb:8a",
    });
    expect(parsePlayerId("ha:a:media_player.kueche")).toEqual({
      source: "ha",
      integrationId: "a",
      playerId: "media_player.kueche",
    });
  });

  it("rejects malformed ids", () => {
    expect(parsePlayerId("nonsense")).toBeUndefined();
    expect(parsePlayerId("ha:a")).toBeUndefined();
    expect(parsePlayerId("ha::media_player.kueche")).toBeUndefined();
    expect(parsePlayerId("xo:a:queue")).toBeUndefined();
  });
});

describe("music track adapters", () => {
  it("converts MA elapsed_time_last_updated from seconds to milliseconds", () => {
    expect(
      fromMusicAssistantNowPlaying(
        nowPlaying({
          elapsedTime: 12.5,
          elapsedTimeLastUpdated: 1_700_000_000,
          currentIndex: 1,
          track: {
            title: "Song",
            artist: "Artist",
            album: "Album",
            durationSeconds: 200,
            artworkUrl: "https://example.com/cover.jpg",
          },
        }),
        "b",
      ),
    ).toEqual({
      source: "musicAssistant",
      integrationId: "b",
      playerId: "b8:27:eb:8a",
      playerName: "Küche",
      title: "Song",
      artist: "Artist",
      album: "Album",
      artworkUrl: "https://example.com/cover.jpg",
      state: "playing",
      positionSeconds: 12.5,
      positionUpdatedAt: 1_700_000_000_000,
      durationSeconds: 200,
    });
  });

  it("does not produce an MA track without a current item and folds unknown states to idle", () => {
    expect(fromMusicAssistantNowPlaying(nowPlaying(), "b")).toBeUndefined();
    expect(
      fromMusicAssistantNowPlaying(
        nowPlaying({ state: "stopped" as NowPlaying["state"], track: { title: "Song" } }),
        "b",
      )?.state,
    ).toBe("idle");
  });

  it("maps HA media attributes and state without trusting their runtime values", () => {
    expect(
      fromSmartHomeEntity(
        smartHomeEntity({
          state: "paused",
          attributes: {
            mediaTitle: "Song",
            mediaArtist: "Artist",
            mediaAlbum: "Album",
            pictureUrl: "https://example.com/cover.jpg",
            mediaPosition: 12,
            mediaPositionUpdatedAt: 1_700_000_000_000,
            mediaDuration: 200,
            mediaContentId: "track-1",
          },
        }),
        "a",
      ),
    ).toEqual({
      source: "homeAssistant",
      integrationId: "a",
      playerId: "media_player.kueche",
      playerName: "Küche",
      title: "Song",
      artist: "Artist",
      album: "Album",
      artworkUrl: "https://example.com/cover.jpg",
      state: "paused",
      positionSeconds: 12,
      positionUpdatedAt: 1_700_000_000_000,
      durationSeconds: 200,
      mediaContentId: "track-1",
    });
  });

  it("falls back to the entity name when HA attributes are missing or invalid", () => {
    const entity = smartHomeEntity({
      state: "off",
      attributes: {
        mediaTitle: "  ",
        mediaPosition: Number.NaN,
        mediaPositionUpdatedAt: "not-a-number" as unknown as number,
        mediaDuration: -1,
      },
    });
    expect(fromSmartHomeEntity(entity, "a")).toEqual({
      source: "homeAssistant",
      integrationId: "a",
      playerId: "media_player.kueche",
      playerName: "Küche",
      title: "Küche",
      state: "idle",
    });
    expect(
      fromSmartHomeEntity(smartHomeEntity({ attributes: undefined as unknown as SmartHomeEntity["attributes"] }), "a")
        ?.title,
    ).toBe("Küche");
  });
});
