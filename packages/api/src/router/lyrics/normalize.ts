import { parse as parseYaml } from "yaml";
import { z } from "zod/v4";
import type { LrclibRecord, NormalizedLyrics, NormalizedLyricLine, NormalizedLyricWord } from "./types";
import { normalizedLyricsSchema } from "./types";

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
