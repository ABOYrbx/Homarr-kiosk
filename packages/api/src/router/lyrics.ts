import { z } from "zod/v4";

import { createLogger } from "@homarr/core/infrastructure/logs";
import { env } from "../env";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TtlLruCache } from "./lyrics/cache";
import { createCacheKey, extractSearchHits, findExactSearchId, parseTrackId } from "./lyrics/match";
import { normalizeSpicyLyrics } from "./lyrics/normalize";
import type { LegacyNormalizedLyrics } from "./lyrics/types";
import { lyricAttributionSchema, normalizedLyricLineSchema } from "./lyrics/types";

const logger = createLogger({ module: "lyricsRouter" });

const SPICY_BASE = "https://api.spicylyrics.org";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 500;
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new TtlLruCache<LyricsResult>(MAX_CACHE_ENTRIES);

const inputSchema = z.object({
  trackId: z.string().max(128).optional(),
  title: z.string().min(1).max(300),
  artist: z.string().max(300).optional(),
  album: z.string().max(300).optional(),
  durationSeconds: z.number().int().min(1).max(3600).optional(),
});

const outputSchema = z.object({
  status: z.enum(["found", "not_found", "unconfigured", "error"]),
  type: z.enum(["syllable", "line", "static"]).optional(),
  lines: z.array(normalizedLyricLineSchema).optional(),
  source: z.string().optional(),
  provider: z.string().optional(),
  uploader: lyricAttributionSchema.optional(),
  maker: lyricAttributionSchema.optional(),
});

type LyricsResult = z.infer<typeof outputSchema>;

const toResult = (lyrics: LegacyNormalizedLyrics): LyricsResult => ({
  status: "found",
  type: lyrics.type,
  lines: lyrics.lines,
  source: lyrics.source,
  provider: lyrics.provider,
  uploader: lyrics.uploader,
  maker: lyrics.maker,
});

type SpicyResponse = { status: number; body?: unknown };

/**
 * One HTTP attempt with its own timeout. A retry creates a fresh controller so
 * it gets the full timeout window instead of inheriting the aborted one.
 */
const requestOnce = async (path: string, key: string): Promise<SpicyResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SPICY_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": "Homarr",
      },
      signal: controller.signal,
    });
    return { status: response.status, body: response.ok ? await response.json() : undefined };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Fetches JSON from the fixed Spicy host. The API key is only ever sent as
 * a header; neither it nor any response body is logged.
 */
const requestJson = async (path: string, key: string): Promise<unknown | null> => {
  const first = await requestOnce(path, key);
  if (first.status === 404) return null;
  if (first.status === 401 || first.status === 403) {
    logger.warn("Spicy Lyrics rejected the configured API key", { status: first.status });
    throw new Error("unauthorized");
  }
  if (first.status === 429) {
    logger.warn("Spicy Lyrics rate limit reached");
    throw new Error("rate_limited");
  }
  if (first.status >= 500) {
    // Exactly one retry for transient server errors, with a fresh timeout.
    const retry = await requestOnce(path, key);
    if (retry.status >= 200 && retry.status < 300) return retry.body ?? null;
    logger.warn("Spicy Lyrics server error", { status: retry.status });
    throw new Error(`http_${retry.status}`);
  }
  if (first.status < 200 || first.status >= 300) {
    logger.warn("Spicy Lyrics request failed", { status: first.status });
    throw new Error(`http_${first.status}`);
  }
  return first.body ?? null;
};

const searchTrackId = async (key: string, input: z.infer<typeof inputSchema>): Promise<string | null> => {
  const params = new URLSearchParams({ title: input.title });
  if (input.artist) params.set("artist", input.artist);
  if (input.durationSeconds) params.set("duration", String(input.durationSeconds));

  const data = await requestJson(`/v1/tracks/search?${params.toString()}`, key);
  if (!data) return null;
  const hits = extractSearchHits((data as { Body?: unknown }).Body ?? data);
  return findExactSearchId(hits, input.durationSeconds) ?? null;
};

export const lyricsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(inputSchema)
    .output(outputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/api/lyrics",
        tags: ["lyrics"],
        protect: true,
        summary: "Get synchronized lyrics",
        description:
          "Find trusted, synchronized lyrics for a track via Spicy Lyrics. Requires a configured server API key and an authenticated user.",
      },
    })
    .query(async ({ input }): Promise<LyricsResult> => {
      const key = env.SPICY_LYRICS_API_KEY;
      if (!key) return { status: "unconfigured" };

      const cacheKey = createCacheKey(input);
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      let result: LyricsResult;
      try {
        let normalized: LegacyNormalizedLyrics | null = null;

        // A usable media_content_id resolves the track directly. If the API
        // has no lyrics for it (or the payload is malformed), fall back to a
        // strict search instead of showing wrong lyrics.
        const directId = parseTrackId(input.trackId);
        if (directId) {
          const data = await requestJson(`/v1/lyrics/${encodeURIComponent(directId)}`, key);
          normalized = data ? normalizeSpicyLyrics(data) : null;
        }

        if (!normalized) {
          const trackId = await searchTrackId(key, input);
          if (trackId && trackId !== directId) {
            const data = await requestJson(`/v1/lyrics/${encodeURIComponent(trackId)}`, key);
            normalized = data ? normalizeSpicyLyrics(data) : null;
          }
        }

        result = normalized ? toResult(normalized) : { status: "not_found" };
      } catch {
        // Status-only logging; no key, no lyrics, no user-facing error.
        result = { status: "error" };
      }

      cache.set(cacheKey, result, result.status === "found" ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
      return result;
    }),
});
