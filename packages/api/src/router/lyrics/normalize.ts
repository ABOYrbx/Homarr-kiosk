import type { z } from "zod/v4";
import type {
  lyricAttributionSchema,
  NormalizedLyrics,
  NormalizedLyricLine,
  NormalizedLyricWord,
  SpicySyllable,
} from "./types";
import { normalizedLyricsSchema, spicyLyricsResponseSchema } from "./types";

const PROVIDER_NAME = "Spicy Lyrics";
const PROVIDER_URL = "https://spicylyrics.org";

const toAttribution = (
  value:
    | { username?: string | null; Username?: string | null; url?: string | null; Url?: string | null }
    | null
    | undefined,
): z.infer<typeof lyricAttributionSchema> | undefined => {
  const username = value?.username?.trim() || value?.Username?.trim();
  const url = value?.url?.trim() || value?.Url?.trim();
  if (!username || !url) return undefined;
  // Only http(s) links are rendered, never javascript:/data: URLs.
  if (!/^https?:\/\//i.test(url)) return undefined;
  return { username, url };
};

const syllableToWords = (syllables: SpicySyllable[]): NormalizedLyricWord[] => {
  const words: NormalizedLyricWord[] = [];
  let buffer = "";
  let start = 0;
  let end = 0;

  const flush = () => {
    const text = buffer.trim();
    if (text.length > 0) words.push({ text, start, end });
    buffer = "";
  };

  for (const syllable of syllables) {
    const text = syllable.Text ?? "";
    if (text.length === 0) continue;
    if (buffer.length === 0) start = syllable.StartTime ?? 0;
    buffer += text;
    end = syllable.EndTime ?? end;
    // IsPartOfWord means another syllable follows in the same word. Only a
    // false (or missing) flag closes the current word.
    if (!syllable.IsPartOfWord) flush();
  }
  flush();
  return words;
};

/**
 * Converts a validated Spicy Lyrics response into the compact client shape.
 * Returns null for empty, unknown or malformed payloads — callers must hide
 * lyrics rather than show an incorrect sync.
 */
export const normalizeSpicyLyrics = (input: unknown): NormalizedLyrics | null => {
  const parsed = spicyLyricsResponseSchema.safeParse(input);
  if (!parsed.success) return null;

  const body = parsed.data.Body;
  if (!body) return null;
  if (!body.Type) return null;
  const type = body.Type;
  const source = body.source?.trim() || "unknown";

  const lines: NormalizedLyricLine[] = [];
  for (const item of body.Content ?? []) {
    const lead = item.Lead;
    if (!lead) continue;
    const syllables = lead.Syllables ?? [];
    if (syllables.length === 0 && !lead.Text?.trim()) continue;

    if (type === "Syllable" && syllables.length > 0) {
      const words = syllableToWords(syllables);
      if (words.length === 0) continue;
      lines.push({
        start: words[0]?.start ?? lead.StartTime ?? 0,
        end: words.at(-1)?.end ?? lead.EndTime ?? 0,
        words,
      });
      continue;
    }

    // Line and Static: the lead is one line. Syllable texts already contain
    // their separators for line-synced content, so concatenate verbatim.
    const text = (lead.Text ?? syllables.map((syllable) => syllable.Text ?? "").join("")).trim();
    if (text.length === 0) continue;
    const timed = type === "Line";
    const start = timed ? (lead.StartTime ?? syllables[0]?.StartTime ?? 0) : 0;
    const end = timed ? (lead.EndTime ?? syllables.at(-1)?.EndTime ?? start) : 0;
    lines.push({
      start,
      end,
      words: [{ text, start, end }],
    });
  }

  if (lines.length === 0) return null;

  const attribution = body.UploadAttribution ?? body.uploadAttribution;
  const uploader = source === "spicy_lyrics" ? toAttribution(attribution?.Uploader) : undefined;
  const maker = source === "spicy_lyrics" ? toAttribution(attribution?.Maker) : undefined;

  const result = normalizedLyricsSchema.safeParse({
    type: type.toLowerCase() as "syllable" | "line" | "static",
    lines,
    source,
    provider: PROVIDER_NAME,
    uploader,
    maker,
  });
  return result.success ? result.data : null;
};

export { PROVIDER_NAME, PROVIDER_URL };
