/** Duration tolerance: exactly two seconds, so remixes cannot be mistaken for the track. */
export const DURATION_TOLERANCE_SECONDS = 2;

export const isDurationMatch = (expected: number, actual: number): boolean =>
  Math.abs(expected - actual) <= DURATION_TOLERANCE_SECONDS;

/** Stable cache key derived from the LRCLIB track signature. */
export const createCacheKey = (input: {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
}): string =>
  `lrclib:${input.title.trim().toLowerCase()}|${(input.artist ?? "").trim().toLowerCase()}|${(input.album ?? "").trim().toLowerCase()}|${input.durationSeconds ?? ""}`;
