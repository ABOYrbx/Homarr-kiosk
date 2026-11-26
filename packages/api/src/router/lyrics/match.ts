import type { SpicySearchHit } from "./types";

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{2}[A-Z0-9]{5}$/i;

/**
 * Extracts a track identifier that Spicy Lyrics can resolve directly.
 * Unknown or library-local identifiers return undefined so the caller falls
 * back to a strict title/artist/duration search.
 */
export const parseTrackId = (mediaContentId: string | null | undefined): string | undefined => {
  const value = mediaContentId?.trim();
  if (!value) return undefined;

  const spotify =
    value.match(/^spotify:\/\/track\/([A-Za-z0-9]{22})/i) ?? value.match(/^spotify:track:([A-Za-z0-9]{22})/i);
  if (spotify?.[1]) return spotify[1];

  const spotifyUrl = value.match(/^https?:\/\/(?:open\.)?spotify\.com\/track\/([A-Za-z0-9]{22})/i);
  if (spotifyUrl?.[1]) return spotifyUrl[1];

  const isrc = value.match(/^isrc:([A-Z0-9]{12})$/i);
  if (isrc?.[1]) return isrc[1].toUpperCase();
  if (ISRC.test(value)) return value.toUpperCase();

  const apple = value.match(/^apple_?music:\/\/track\/([A-Za-z0-9]+)/i);
  if (apple?.[1]) return apple[1];

  // Music Assistant often reports a bare Spotify track id.
  if (SPOTIFY_ID.test(value)) return value;

  return undefined;
};

/** Duration tolerance: 3 seconds or 2 %, whichever is larger. */
export const isDurationMatch = (expected: number, actual: number): boolean =>
  Math.abs(expected - actual) <= Math.max(3, expected * 0.02);

/** Spicy search hits sometimes only carry provider-specific ids. */
const firstId = (ids: SpicySearchHit["ids"]): string | undefined => {
  for (const value of [ids?.spotify, ids?.isrc, ids?.apple_music]) {
    const id = value?.trim();
    if (id) return id;
  }
  return undefined;
};

/**
 * Picks the first search hit that is safe to use for an automatic fetch.
 * Only `exact` tier is trusted, and the duration must match when known —
 * remixes and live versions have different timings and must fall back to no
 * lyrics rather than wrong ones.
 */
export const findExactSearchId = (hits: SpicySearchHit[], durationSeconds?: number): string | undefined => {
  for (const hit of hits) {
    if (hit.tier?.toLowerCase() !== "exact") continue;
    const id = hit.id?.trim() ?? firstId(hit.ids);
    if (!id) continue;
    if (durationSeconds !== undefined) {
      const duration = typeof hit.duration === "number" ? hit.duration : Number(hit.duration);
      // Without a comparable duration we cannot rule out a remix or live
      // version, so an exact-looking hit is not safe to use.
      if (!Number.isFinite(duration) || !isDurationMatch(durationSeconds, duration)) continue;
    }
    return id;
  }
  return undefined;
};

/** Flattens the possible shapes of the Spicy search response into a hit list. */
export const extractSearchHits = (body: unknown): SpicySearchHit[] => {
  if (Array.isArray(body)) return body as SpicySearchHit[];
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const candidates = record.results ?? record.Results ?? record.Body;
  return Array.isArray(candidates) ? (candidates as SpicySearchHit[]) : [];
};

/** Stable, bounded cache key. The key never contains the API secret. */
export const createCacheKey = (input: {
  trackId?: string;
  title: string;
  artist?: string;
  durationSeconds?: number;
}): string => {
  if (input.trackId) return `id:${input.trackId}`;
  return `q:${input.title.trim().toLowerCase()}|${(input.artist ?? "").trim().toLowerCase()}|${input.durationSeconds ?? ""}`;
};

export { SPOTIFY_ID, ISRC };
