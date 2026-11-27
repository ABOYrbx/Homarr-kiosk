import { describe, expect, it, vi } from "vitest";

import { TtlLruCache } from "./cache";
import { fetchLrclibLyrics } from "./lrclib";
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

describe("fetchLrclibLyrics", () => {
  const validRecord = {
    id: 5,
    trackName: "T",
    artistName: "A",
    duration: 200,
    instrumental: false,
    hasWordSync: false,
    plainLyrics: "x",
    syncedLyrics: null,
    lyricsfile: "",
  };

  it("maps 404 to not_found and 429 to error", async () => {
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
        .mockResolvedValueOnce({ status: 429, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      const base = { title: "T", artist: "A" };
      expect((await fetchLrclibLyrics(base)).status).toBe("not_found");
      expect((await fetchLrclibLyrics(base)).status).toBe("error");
      // One request per call: no retries on 404 or 429.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("queries the signature and validates the body", async () => {
    try {
      const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => validRecord });
      vi.stubGlobal("fetch", fetchMock);
      const result = await fetchLrclibLyrics({ title: "T", artist: "A", album: "Album", durationSeconds: 200 });
      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.record).toEqual(validRecord);
      expect(String(fetchMock.mock.calls[0][0])).toContain("track_name=T&artist_name=A&album_name=Album&duration=200");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns not_found without fetching when the artist is missing", async () => {
    try {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await fetchLrclibLyrics({ title: "T", artist: "  ", durationSeconds: 200 })).toEqual({
        status: "not_found",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps other non-2xx responses to error without retrying", async () => {
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ status: 503, json: async () => ({}) })
        .mockResolvedValueOnce({ status: 500, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      const base = { title: "T", artist: "A" };
      expect((await fetchLrclibLyrics(base)).status).toBe("error");
      expect((await fetchLrclibLyrics(base)).status).toBe("error");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps an invalid 2xx body to error", async () => {
    try {
      const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ id: "not-a-number" }) });
      vi.stubGlobal("fetch", fetchMock);
      expect((await fetchLrclibLyrics({ title: "T", artist: "A" })).status).toBe("error");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the fixed host with the required headers and no credentials", async () => {
    try {
      const fetchMock = vi.fn().mockResolvedValue({ status: 404, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      await fetchLrclibLyrics({ title: "T", artist: "A" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url).startsWith("https://lrclib.net/api/get?")).toBe(true);
      const headers = new Headers(init.headers);
      expect(headers.get("Accept")).toBe("application/json");
      expect(headers.get("User-Agent")).toBe("Homarr idle screen (+https://github.com/ABOYrbx/Homarr-kiosk)");
      expect(headers.has("Authorization")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits optional query parameters when they are undefined", async () => {
    try {
      const fetchMock = vi.fn().mockResolvedValue({ status: 404, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      await fetchLrclibLyrics({ title: "Some Song", artist: "Some Artist" });
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        "https://lrclib.net/api/get?track_name=Some+Song&artist_name=Some+Artist",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("aborts the request after five seconds and reports an error", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn().mockImplementation((_url: unknown, init: { signal?: AbortSignal }) => {
        signal = init.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const promise = fetchLrclibLyrics({ title: "T", artist: "A" });
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(4999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      await expect(promise).resolves.toEqual({ status: "error" });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("clears the timeout once the response has settled", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn().mockImplementation((_url: unknown, init: { signal?: AbortSignal }) => {
        signal = init.signal;
        return Promise.resolve({ status: 404, json: async () => ({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      expect((await fetchLrclibLyrics({ title: "T", artist: "A" })).status).toBe("not_found");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
