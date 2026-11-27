import { describe, expect, it, vi } from "vitest";

import { TtlLruCache } from "./cache";
import { createCacheKey, findExactSearchId, isDurationMatch, parseTrackId } from "./match";
import { normalizeLrclibRecord, normalizeSpicyLyrics } from "./normalize";

const syllable = (text: string, start: number, end: number, isPartOfWord = false) => ({
  Text: text,
  StartTime: start,
  EndTime: end,
  IsPartOfWord: isPartOfWord,
});

describe("parseTrackId", () => {
  it("accepts Spotify ids in every documented form", () => {
    const id = "1QV6tiMFM6fSOKOGLMHYYg";
    expect(parseTrackId(`spotify://track/${id}`)).toBe(id);
    expect(parseTrackId(`spotify:track:${id}`)).toBe(id);
    expect(parseTrackId(`https://open.spotify.com/track/${id}`)).toBe(id);
  });

  it("accepts ISRC and Apple Music ids", () => {
    expect(parseTrackId("isrc:USUM70824409")).toBe("USUM70824409");
    expect(parseTrackId("USUM70824409")).toBe("USUM70824409");
    expect(parseTrackId("apple_music://track/713369399")).toBe("713369399");
    expect(parseTrackId("applemusic://track/713369399")).toBe("713369399");
  });

  it("falls back to search for library and unknown ids", () => {
    expect(parseTrackId("library://track/123")).toBeUndefined();
    expect(parseTrackId("tidal://track/77707019")).toBeUndefined();
    expect(parseTrackId(undefined)).toBeUndefined();
  });
});

describe("findExactSearchId", () => {
  const hits = [
    { id: "close", tier: "close", duration: 200 },
    { id: "wrong-version", tier: "exact", duration: 150 },
    { id: "match", tier: "exact", duration: 202 },
  ];

  it("only accepts an exact tier with a matching duration", () => {
    expect(findExactSearchId(hits, 200)).toBe("match");
  });

  it("rejects close tiers and mismatching durations", () => {
    expect(findExactSearchId(hits.slice(0, 1), 200)).toBeUndefined();
    expect(findExactSearchId(hits.slice(1, 2), 200)).toBeUndefined();
    expect(findExactSearchId([{ id: "x", tier: "unknown", duration: 200 }], 200)).toBeUndefined();
  });

  it("accepts an exact tier without a duration tolerance when unknown", () => {
    expect(findExactSearchId(hits)).toBe("wrong-version");
  });

  it("falls back to a provider id when the hit has no generic id", () => {
    expect(findExactSearchId([{ tier: "exact", duration: 200, ids: { spotify: "from-ids" } }], 200)).toBe("from-ids");
  });
});

describe("normalizeSpicyLyrics", () => {
  it("groups syllables into words and ignores background vocals", () => {
    const result = normalizeSpicyLyrics({
      Status: 200,
      Body: {
        Type: "Syllable",
        source: "spicy_lyrics",
        Content: [
          {
            Type: "Vocal",
            Lead: {
              StartTime: 1,
              EndTime: 4,
              Syllables: [
                syllable("Hel", 1, 1.5, true),
                syllable("lo ", 1.5, 2),
                syllable("wor", 2.5, 3, true),
                syllable("ld", 3, 4),
              ],
            },
            Background: [{ Syllables: [syllable("ignored", 1, 2)] }],
          },
        ],
      },
    });

    expect(result?.type).toBe("syllable");
    expect(result?.lines).toHaveLength(1);
    expect(result?.lines[0]?.words.map((word) => word.text)).toEqual(["Hello", "world"]);
    expect(result?.lines[0]?.start).toBe(1);
    expect(result?.lines[0]?.end).toBe(4);
    expect(JSON.stringify(result)).not.toContain("ignored");
  });

  it("creates one line per content item for line-synced lyrics", () => {
    const result = normalizeSpicyLyrics({
      Body: {
        Type: "Line",
        source: "spotify",
        Content: [
          { Lead: { StartTime: 0, EndTime: 2, Syllables: [syllable("First line", 0, 2)] } },
          { Lead: { StartTime: 2, EndTime: 4, Syllables: [syllable("Second line", 2, 4)] } },
        ],
      },
    });
    expect(result?.lines.map((line) => line.words[0]?.text)).toEqual(["First line", "Second line"]);
    expect(result?.lines[1]?.start).toBe(2);
    expect(result?.provider).toBe("Spicy Lyrics");
    expect(result?.source).toBe("spotify");
  });

  it("keeps static lyrics untimed and extracts community attribution", () => {
    const result = normalizeSpicyLyrics({
      Body: {
        Type: "Static",
        source: "spicy_lyrics",
        Content: [{ Lead: { Syllables: [syllable("No timing", 0, 0)] } }],
        UploadAttribution: {
          Uploader: { username: "uploader", url: "https://spicylyrics.org/uid/1" },
          Maker: { username: "maker", url: "https://spicylyrics.org/uid/2" },
        },
      },
    });
    expect(result?.type).toBe("static");
    expect(result?.lines[0]).toMatchObject({ start: 0, end: 0 });
    expect(result?.uploader).toEqual({ username: "uploader", url: "https://spicylyrics.org/uid/1" });
    expect(result?.maker?.username).toBe("maker");
  });

  it("accepts capitalized attribution field names", () => {
    const result = normalizeSpicyLyrics({
      Body: {
        Type: "Line",
        source: "spicy_lyrics",
        Content: [{ Lead: { StartTime: 0, EndTime: 1, Syllables: [syllable("Line", 0, 1)] } }],
        UploadAttribution: { Uploader: { Username: "uploader", Url: "https://spicylyrics.org/u/1" } },
      },
    });
    expect(result?.uploader).toEqual({ username: "uploader", url: "https://spicylyrics.org/u/1" });
  });

  it("rejects empty, malformed and non-http attribution payloads", () => {
    expect(normalizeSpicyLyrics({ Body: { Type: "Line", Content: [] } })).toBeNull();
    expect(normalizeSpicyLyrics(null)).toBeNull();
    expect(
      normalizeSpicyLyrics({
        Body: {
          Type: "Line",
          source: "spicy_lyrics",
          Content: [{ Lead: { Syllables: [syllable("Line", 0, 1)] } }],
          UploadAttribution: { Uploader: { username: "x", url: "javascript:alert(1)" } },
        },
      })?.uploader,
    ).toBeUndefined();
  });
});

describe("TtlLruCache", () => {
  it("expires negative results after one day and positive after seven", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const cache = new TtlLruCache<string>(2);
      cache.set("hit", "lyrics", 7 * 24 * 60 * 60 * 1000);
      cache.set("miss", "error", 24 * 60 * 60 * 1000);
      vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));
      expect(cache.get("hit")).toBe("lyrics");
      expect(cache.get("miss")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the least recently used entry", () => {
    const cache = new TtlLruCache<number>(2);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.get("a");
    cache.set("c", 3, 1000);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(createCacheKey({ title: "Track", artist: "Artist", durationSeconds: 200 })).toBe("lrclib:track|artist||200");
  });
});

describe("LRCLIB helpers", () => {
  it("rejects duration outside 2 seconds", () => {
    expect(isDurationMatch(200, 202)).toBe(true);
    expect(isDurationMatch(200, 205)).toBe(false);
  });
  it("builds a stable key from the track signature", () => {
    expect(createCacheKey({ title: "Track", artist: "Artist", album: "Album", durationSeconds: 200 })).toBe(
      "lrclib:track|artist|album|200",
    );
  });
  it("expires entries with an explicit TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cache = new TtlLruCache<string>(2);
    cache.set("a", "lyrics", 1000);
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("normalizeLrclibRecord", () => {
  it("parses word-synced lyricsfile timings into seconds", () => {
    const result = normalizeLrclibRecord({
      id: 1,
      trackName: "T",
      artistName: "A",
      albumName: null,
      duration: 200,
      instrumental: false,
      hasWordSync: true,
      plainLyrics: null,
      syncedLyrics: null,
      lyricsfile:
        "version: '1.0'\nlines:\n- text: Hello world\n  start_ms: 10180\n  end_ms: 15740\n  words:\n  - text: 'Hello '\n    start_ms: 10180\n  - text: world\n    start_ms: 12000",
    });
    expect(result?.type).toBe("syllable");
    expect(result?.lines[0]).toMatchObject({ start: 10.18, end: 15.74 });
    expect(result?.lines[0]?.words[0]).toEqual({ text: "Hello ", start: 10.18, end: 12 });
  });
  it("falls back to LRC lines and then plain lyrics", () => {
    const base = {
      id: 2,
      trackName: "T",
      artistName: "A",
      albumName: null,
      duration: 200,
      instrumental: false,
      hasWordSync: false,
      lyricsfile: "",
    };
    expect(
      normalizeLrclibRecord({ ...base, plainLyrics: null, syncedLyrics: "[00:17.12] First\n[00:20.00] Second" })
        ?.lines[0],
    ).toMatchObject({ start: 17.12, end: 20 });
    expect(normalizeLrclibRecord({ ...base, plainLyrics: "One\nTwo", syncedLyrics: null })?.type).toBe("static");
  });
  it("malformed YAML falls back to synced lyrics", () => {
    const result = normalizeLrclibRecord({
      id: 3,
      trackName: "T",
      artistName: "A",
      albumName: null,
      duration: 200,
      instrumental: false,
      hasWordSync: true,
      plainLyrics: null,
      syncedLyrics: "[00:01.00] Safe",
      lyricsfile: "lines: [oops",
    });
    expect(result?.lines[0]?.words[0]?.text).toBe("Safe");
  });
  it("word end derives from next word", () => {
    const result = normalizeLrclibRecord({
      id: 4,
      trackName: "T",
      artistName: "A",
      albumName: null,
      duration: 200,
      instrumental: false,
      hasWordSync: true,
      plainLyrics: null,
      syncedLyrics: null,
      lyricsfile:
        "lines:\n- text: a b\n  start_ms: 1000\n  end_ms: 3000\n  words:\n  - text: a\n    start_ms: 1000\n  - text: b\n    start_ms: 2000",
    });
    expect(result?.lines[0]?.words[0]?.end).toBe(2);
    expect(result?.lines[0]?.words[1]?.end).toBe(3);
  });
});
