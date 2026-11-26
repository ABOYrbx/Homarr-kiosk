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
  source: z.string(),
  provider: z.string(),
  uploader: lyricAttributionSchema.optional(),
  maker: lyricAttributionSchema.optional(),
});

export type NormalizedLyrics = z.infer<typeof normalizedLyricsSchema>;
export type NormalizedLyricLine = z.infer<typeof normalizedLyricLineSchema>;
export type NormalizedLyricWord = z.infer<typeof normalizedLyricWordSchema>;

/**
 * Defensive schema for the Spicy Lyrics responses. Unknown fields are
 * intentionally kept out of the normalized result (translations, background
 * vocals, avatars, ...) so they can never leak to the client or logs.
 */
const spicySyllableSchema = z
  .object({
    Text: z.string().nullish(),
    StartTime: z.number().nullish(),
    EndTime: z.number().nullish(),
    IsPartOfWord: z.boolean().nullish(),
  })
  .passthrough();

export type SpicySyllable = z.infer<typeof spicySyllableSchema>;

const spicyLeadSchema = z
  .object({
    Syllables: z.array(spicySyllableSchema).nullish(),
    Text: z.string().nullish(),
    StartTime: z.number().nullish(),
    EndTime: z.number().nullish(),
  })
  .passthrough();

const spicyContentSchema = z
  .object({
    Type: z.string().nullish(),
    Lead: spicyLeadSchema.nullish(),
  })
  .passthrough();

const spicyAttributionSchema = z
  .object({
    username: z.string().nullish(),
    Username: z.string().nullish(),
    url: z.string().nullish(),
    Url: z.string().nullish(),
  })
  .passthrough();

export const spicyLyricsResponseSchema = z
  .object({
    Body: z
      .object({
        Type: z.enum(["Syllable", "Line", "Static"]).nullish(),
        Content: z.array(spicyContentSchema).nullish(),
        source: z.string().nullish(),
        UploadAttribution: z
          .object({
            Uploader: spicyAttributionSchema.nullish(),
            Maker: spicyAttributionSchema.nullish(),
          })
          .nullish(),
        uploadAttribution: z
          .object({
            Uploader: spicyAttributionSchema.nullish(),
            Maker: spicyAttributionSchema.nullish(),
          })
          .nullish(),
      })
      .nullish(),
    Status: z.number().nullish(),
  })
  .passthrough();

export const spicySearchResponseSchema = z
  .object({
    Body: z
      .union([
        z.array(
          z
            .object({
              id: z.string().nullish(),
              ids: z.record(z.string(), z.string().nullish()).nullish(),
              title: z.string().nullish(),
              artists: z.union([z.array(z.string()), z.string()]).nullish(),
              duration: z.union([z.number(), z.string()]).nullish(),
              tier: z.string().nullish(),
            })
            .passthrough(),
        ),
        z.object({
          results: z
            .array(
              z
                .object({
                  id: z.string().nullish(),
                  ids: z.record(z.string(), z.string().nullish()).nullish(),
                  title: z.string().nullish(),
                  artists: z.union([z.array(z.string()), z.string()]).nullish(),
                  duration: z.union([z.number(), z.string()]).nullish(),
                  tier: z.string().nullish(),
                })
                .passthrough(),
            )
            .nullish(),
          Results: z.array(z.unknown()).nullish(),
        }),
      ])
      .nullish(),
    results: z.array(z.unknown()).nullish(),
    Results: z.array(z.unknown()).nullish(),
  })
  .passthrough();

export type SpicySearchHit = {
  id?: string | null;
  duration?: number | string | null;
  tier?: string | null;
  ids?: Record<string, string | null | undefined> | null;
};
