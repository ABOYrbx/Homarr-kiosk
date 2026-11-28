import type { MusicTrack } from "./music-track";

export type PlayerIdSource = "ha" | "ma";
export type PlayerId = {
  source: PlayerIdSource;
  integrationId: string;
  playerId: string;
};

const playerIdPrefix = (source: MusicTrack["source"]): PlayerIdSource => (source === "homeAssistant" ? "ha" : "ma");

const trackKey = (track: MusicTrack): string =>
  `${playerIdPrefix(track.source)}:${track.integrationId}:${track.playerId}`;

/**
 * Parse `ha:<integrationId>:<entityId>` / `ma:<integrationId>:<queueId>`.
 * Only the first two colons are separators: MA queue ids can contain colons.
 */
export const parsePlayerId = (id: string): PlayerId | undefined => {
  const first = id.indexOf(":");
  if (first <= 0) return undefined;
  const second = id.indexOf(":", first + 1);
  if (second < 0 || second === first + 1 || second === id.length - 1) return undefined;

  const source = id.slice(0, first);
  if (source !== "ha" && source !== "ma") return undefined;

  return {
    source,
    integrationId: id.slice(first + 1, second),
    playerId: id.slice(second + 1),
  };
};

/** Apply the user's include/exclude list to all discovered players. */
export const filterMusicTracks = (tracks: MusicTrack[], mode: "include" | "exclude", ids: string[]): MusicTrack[] => {
  const selected = new Set(ids);
  return tracks.filter((track) => {
    const matches = selected.has(trackKey(track));
    return mode === "include" ? matches : !matches;
  });
};

/**
 * The most recently updated playing source wins. Missing timestamps count as
 * epoch zero, and HA wins ties so auto selection stays deterministic.
 */
export const pickPlayingTrack = (tracks: MusicTrack[]): MusicTrack | undefined => {
  const playing = tracks.filter((track) => track.state === "playing");
  if (playing.length === 0) return undefined;

  return playing.reduce((best, candidate) => {
    const candidateAt = candidate.positionUpdatedAt ?? 0;
    const bestAt = best.positionUpdatedAt ?? 0;
    if (candidateAt !== bestAt) return candidateAt > bestAt ? candidate : best;
    if (candidate.source !== best.source) return candidate.source === "homeAssistant" ? candidate : best;
    return best;
  });
};
