import type { RouterOutputs } from "@homarr/api";
import type { SmartHomeEntity } from "@homarr/integrations/types";

import type { QueueView } from "./use-music-assistant-queue";

export type MusicAssistantNowPlaying = RouterOutputs["musicAssistant"]["nowPlaying"][number];

/**
 * One playable source, independent of whether Home Assistant or Music
 * Assistant reported it. Position timestamps are always milliseconds so the
 * idle clock can consume either source unchanged.
 */
export type MusicTrack = {
  source: "homeAssistant" | "musicAssistant";
  integrationId: string;
  playerId: string;
  playerName: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state: "playing" | "paused" | "idle";
  positionSeconds?: number;
  positionUpdatedAt?: number;
  durationSeconds?: number;
  mediaContentId?: string;
  queue?: QueueView;
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const positionNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const toState = (value: unknown): MusicTrack["state"] => (value === "playing" || value === "paused" ? value : "idle");

/** Adapt a HA media_player entity. Attributes are untrusted live WS data. */
export const fromSmartHomeEntity = (entity: SmartHomeEntity, integrationId: string): MusicTrack | undefined => {
  const attributes = entity.attributes ?? {};
  const title = text(attributes.mediaTitle) ?? text(entity.name);
  if (!title) return undefined;

  const track: MusicTrack = {
    source: "homeAssistant",
    integrationId,
    playerId: entity.id,
    playerName: text(entity.name) ?? entity.id,
    title,
    state: toState(entity.state),
  };

  const artist = text(attributes.mediaArtist);
  if (artist) track.artist = artist;
  const album = text(attributes.mediaAlbum);
  if (album) track.album = album;
  const artworkUrl = text(attributes.pictureUrl);
  if (artworkUrl) track.artworkUrl = artworkUrl;
  const positionSeconds = positionNumber(attributes.mediaPosition);
  if (positionSeconds !== undefined) track.positionSeconds = positionSeconds;
  const positionUpdatedAt = positionNumber(attributes.mediaPositionUpdatedAt);
  if (positionUpdatedAt !== undefined) track.positionUpdatedAt = positionUpdatedAt;
  const durationSeconds = positionNumber(attributes.mediaDuration);
  if (durationSeconds !== undefined) track.durationSeconds = durationSeconds;
  const mediaContentId = text(attributes.mediaContentId);
  if (mediaContentId) track.mediaContentId = mediaContentId;

  return track;
};

/**
 * Adapt one MA queue's now-playing record. MA reports elapsed time and its
 * timestamp in seconds; the timestamp becomes milliseconds here so both
 * sources feed the same playback clock.
 */
export const fromMusicAssistantNowPlaying = (
  nowPlaying: MusicAssistantNowPlaying,
  integrationId: string,
): MusicTrack | undefined => {
  const title = text(nowPlaying.track?.title);
  if (!title) return undefined;

  const track: MusicTrack = {
    source: "musicAssistant",
    integrationId,
    playerId: nowPlaying.queueId,
    playerName: text(nowPlaying.name) ?? nowPlaying.queueId,
    title,
    state: toState(nowPlaying.state),
  };

  const artist = text(nowPlaying.track?.artist);
  if (artist) track.artist = artist;
  const album = text(nowPlaying.track?.album);
  if (album) track.album = album;
  const artworkUrl = text(nowPlaying.track?.artworkUrl);
  if (artworkUrl) track.artworkUrl = artworkUrl;
  const positionSeconds = positionNumber(nowPlaying.elapsedTime);
  if (positionSeconds !== undefined) track.positionSeconds = positionSeconds;
  const updatedInSeconds = positionNumber(nowPlaying.elapsedTimeLastUpdated);
  if (updatedInSeconds !== undefined) track.positionUpdatedAt = updatedInSeconds * 1000;
  const durationSeconds = positionNumber(nowPlaying.track?.durationSeconds);
  if (durationSeconds !== undefined) track.durationSeconds = durationSeconds;

  return track;
};
