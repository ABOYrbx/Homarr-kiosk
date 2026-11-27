import { TtlLruCache } from "./cache";
import { fetchLrclibLyrics } from "./lrclib";
import { createCacheKey, isDurationMatch } from "./match";
import { normalizeLrclibRecord } from "./normalize";
import type { LyricsResult } from "./types";

const MAX_CACHE_ENTRIES = 500;
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 1000;

const cache = new TtlLruCache<LyricsResult>(MAX_CACHE_ENTRIES);

type LyricsInput = Parameters<typeof fetchLrclibLyrics>[0];

/**
 * Resolves track lyrics through keyless LRCLIB with a small in-memory cache.
 * Only track metadata feeds the cache key; responses, lyrics and credentials
 * are never logged.
 */
export const resolveLyrics = async (input: LyricsInput): Promise<LyricsResult> => {
  const cacheKey = createCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let result: LyricsResult;
  try {
    const fetched = await fetchLrclibLyrics(input);
    if (fetched.status !== "ok") {
      result = { status: fetched.status };
    } else {
      const normalized = normalizeLrclibRecord(fetched.record);
      const durationMismatch =
        input.durationSeconds !== undefined && !isDurationMatch(input.durationSeconds, fetched.record.duration);
      result = normalized && !durationMismatch ? { status: "found", ...normalized } : { status: "not_found" };
    }
  } catch {
    // Status-only fallback: never log the response body or lyrics.
    result = { status: "error" };
  }

  const ttlMs = result.status === "found" ? FOUND_TTL_MS : result.status === "error" ? ERROR_TTL_MS : NOT_FOUND_TTL_MS;
  cache.set(cacheKey, result, ttlMs);
  return result;
};
