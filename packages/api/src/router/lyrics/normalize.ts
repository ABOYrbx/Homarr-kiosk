import { parse as parseYaml } from "yaml";
import { z } from "zod/v4";
import type {
  LegacyNormalizedLyrics,
  LrclibRecord,
  lyricAttributionSchema,
  NormalizedLyrics,
  NormalizedLyricLine,
  NormalizedLyricWord,
  SpicySyllable,
} from "./types";
import { legacyNormalizedLyricsSchema, normalizedLyricsSchema, spicyLyricsResponseSchema } from "./types";

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
export const normalizeSpicyLyrics = (input: unknown): LegacyNormalizedLyrics | null => {
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

  const result = legacyNormalizedLyricsSchema.safeParse({
    type: type.toLowerCase() as "syllable" | "line" | "static",
    lines,
    source,
    provider: PROVIDER_NAME,
    uploader,
    maker,
  });
  return result.success ? result.data : null;
};

const lrclibWordSchema = z.object({
  text: z.string(),
  start_ms: z.number(),
});

const lrclibFileLineSchema = z.object({
  text: z.string(),
  start_ms: z.number(),
  end_ms: z.number().nullish(),
  words: z.array(lrclibWordSchema).nullish(),
});

const lrclibFileSchema = z.object({
  lines: z.array(lrclibFileLineSchema),
});

const LRC_LINE = /^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/gm;

const buildNormalizedLyrics = (
  type: NormalizedLyrics["type"],
  lines: NormalizedLyricLine[],
): NormalizedLyrics | null => {
  const parsed = normalizedLyricsSchema.safeParse({ type, lines, source: "lrclib", provider: "LRCLIB" });
  return parsed.success ? parsed.data : null;
};

/** Word-level `lyricsfile` YAML. Every *_ms value is converted to seconds. */
const normalizeLyricsFile = (lyricsfile: string | null | undefined): NormalizedLyrics | null => {
  if (!lyricsfile?.trim()) return null;

  let document: unknown;
  try {
    document = parseYaml(lyricsfile);
  } catch {
    return null;
  }

  const parsed = lrclibFileSchema.safeParse(document);
  if (!parsed.success) return null;

  const wordSync = parsed.data.lines.some((line) => (line.words?.length ?? 0) > 0);
  const lines: NormalizedLyricLine[] = [];
  for (const item of parsed.data.lines) {
    const words: NormalizedLyricWord[] = [];
    const timedWords = item.words ?? [];
    for (const [index, word] of timedWords.entries()) {
      if (!word.text.trim()) continue;
      const endMs = timedWords[index + 1]?.start_ms ?? item.end_ms ?? word.start_ms + 1;
      words.push({ text: word.text, start: word.start_ms / 1000, end: endMs / 1000 });
    }
    if (words.length === 0 && item.text.trim()) {
      const start = item.start_ms / 1000;
      const end = (item.end_ms ?? item.start_ms) / 1000;
      words.push({ text: item.text, start, end });
    }
    if (words.length === 0) continue;

    const start = item.start_ms / 1000;
    lines.push({
      start,
      end: item.end_ms !== null && item.end_ms !== undefined ? item.end_ms / 1000 : (words.at(-1)?.end ?? start),
      words,
    });
  }

  if (lines.length === 0) return null;
  return buildNormalizedLyrics(wordSync ? "syllable" : "line", lines);
};

/** Line-timed LRC. A line ends when the next one starts, or after five seconds. */
const normalizeLrc = (syncedLyrics: string | null | undefined): NormalizedLyrics | null => {
  if (!syncedLyrics?.trim()) return null;

  const entries: { start: number; text: string }[] = [];
  for (const match of syncedLyrics.matchAll(LRC_LINE)) {
    const text = match[4]?.trim();
    if (!text) continue;
    const fraction = match[3] ? Number(match[3]) / 10 ** match[3].length : 0;
    const start = Number(match[1]) * 60 + Number(match[2]) + fraction;
    if (Number.isFinite(start)) entries.push({ start, text });
  }
  if (entries.length === 0) return null;

  const lines: NormalizedLyricLine[] = entries.map((entry, index) => {
    const end = entries[index + 1]?.start ?? entry.start + 5;
    return { start: entry.start, end, words: [{ text: entry.text, start: entry.start, end }] };
  });
  return buildNormalizedLyrics("line", lines);
};

/** Untimed plain text: each non-empty line is a static lyric line. */
const normalizePlain = (plainLyrics: string | null | undefined): NormalizedLyrics | null => {
  if (!plainLyrics?.trim()) return null;

  const lines: NormalizedLyricLine[] = plainLyrics
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ start: 0, end: 0, words: [{ text, start: 0, end: 0 }] }));

  return lines.length > 0 ? buildNormalizedLyrics("static", lines) : null;
};

/**
 * Converts a validated LRCLIB record into the compact client shape, preferring
 * word timings over line timings over plain text. Never throws on malformed
 * provider data; callers hide lyrics when null is returned.
 */
export const normalizeLrclibRecord = (record: LrclibRecord): NormalizedLyrics | null => {
  if (record.instrumental) return null;
  return (
    normalizeLyricsFile(record.lyricsfile) ?? normalizeLrc(record.syncedLyrics) ?? normalizePlain(record.plainLyrics)
  );
};

export { PROVIDER_NAME, PROVIDER_URL };
