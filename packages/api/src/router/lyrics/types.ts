import { z } from "zod/v4";

/**
 * Normalized lyrics shape shared by the lyrics router and the idle-screen client.
 * All timings are in seconds. `start`/`end` are 0 for static (untimed) lyrics.
 */
export const normalizedLyricWordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

export const normalizedLyricLineSchema = z.object({
  start: z.number(),
  end: z.number(),
  words: z.array(normalizedLyricWordSchema),
});

export const lyricAttributionSchema = z.object({
  username: z.string(),
  url: z.string(),
});

export const normalizedLyricsSchema = z.object({
  type: z.enum(["syllable", "line", "static"]),
  lines: z.array(normalizedLyricLineSchema),
  source: z.literal("lrclib"),
  provider: z.literal("LRCLIB"),
});

export type NormalizedLyrics = z.infer<typeof normalizedLyricsSchema>;
export type NormalizedLyricLine = z.infer<typeof normalizedLyricLineSchema>;
export type NormalizedLyricWord = z.infer<typeof normalizedLyricWordSchema>;

/**
 * Defensive schema for the LRCLIB `/api/get` response. Fields that LRCLIB may
 * omit or return as null are optional; unknown fields are stripped.
 */
export const lrclibRecordSchema = z.object({
  id: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string().nullish(),
  duration: z.number(),
  instrumental: z.boolean(),
  hasWordSync: z.boolean(),
  plainLyrics: z.string().nullish(),
  syncedLyrics: z.string().nullish(),
  lyricsfile: z.string().nullish(),
});

export type LrclibRecord = z.infer<typeof lrclibRecordSchema>;

/**
 * Router response. `unconfigured` is no longer produced now that LRCLIB needs
 * no API key, but stays in the enum for existing clients.
 */
export const lyricsResultSchema = z.object({
  status: z.enum(["found", "not_found", "unconfigured", "error"]),
  type: z.enum(["syllable", "line", "static"]).optional(),
  lines: z.array(normalizedLyricLineSchema).optional(),
  source: z.string().optional(),
  provider: z.string().optional(),
  uploader: lyricAttributionSchema.optional(),
  maker: lyricAttributionSchema.optional(),
});

export type LyricsResult = z.infer<typeof lyricsResultSchema>;
