import { describe, expect, it } from "vitest";

import { isIdleScreenOpen } from "./preview-context";
import { getClockAngles } from "./angles";
import type { LyricLine } from "./lyrics-view";
import { buildTrackKey, effectiveLineEnd, findActiveLineIndex, findActiveWordIndex } from "./lyrics-view";
import { computePlaybackPosition, decideIdleView, formatDuration } from "./playback";

describe("idle screen open state", () => {
  it("opens for either the timer or the preview", () => {
    expect(isIdleScreenOpen({ previewOpen: true, timerOpen: false })).toBe(true);
    expect(isIdleScreenOpen({ previewOpen: false, timerOpen: true })).toBe(true);
    expect(isIdleScreenOpen({ previewOpen: false, timerOpen: false })).toBe(false);
  });
});

describe("clock angles", () => {
  it("points straight up at 12:00:00", () => {
    expect(getClockAngles(new Date(2026, 0, 1, 12, 0, 0), true)).toEqual({ hour: 0, minute: 0, second: 0 });
  });

  it("uses a 12-hour dial for the hour hand and includes minutes", () => {
    const angles = getClockAngles(new Date(2026, 0, 1, 15, 30, 0), false);
    expect(angles.hour).toBeCloseTo(105, 5);
    expect(angles.minute).toBeCloseTo(180, 5);
    expect(angles.second).toBe(0);
  });

  it("omits the second hand when disabled", () => {
    expect(getClockAngles(new Date(2026, 0, 1, 1, 1, 30), false).second).toBe(0);
    expect(getClockAngles(new Date(2026, 0, 1, 1, 1, 30), true).second).toBe(180);
  });
});

describe("playback position", () => {
  const base = { mediaPosition: 10, mediaPositionUpdatedAt: 1000, mediaDuration: 100 };

  it("freezes while paused", () => {
    expect(computePlaybackPosition({ ...base, state: "paused", now: 5000 })).toBe(10);
  });

  it("rebases on the HA timestamp while playing", () => {
    expect(computePlaybackPosition({ ...base, state: "playing", now: 4000 })).toBe(13);
  });

  it("treats a changed HA timestamp as a seek and rebases immediately", () => {
    expect(
      computePlaybackPosition({
        state: "playing",
        mediaPosition: 30,
        mediaPositionUpdatedAt: 9_000,
        mediaDuration: 100,
        now: 10_000,
      }),
    ).toBe(31);
  });

  it("clamps to the reported duration", () => {
    expect(computePlaybackPosition({ ...base, state: "playing", now: 120_000 })).toBe(100);
  });

  it("returns null without a position", () => {
    expect(computePlaybackPosition({ state: "playing", now: 1000 })).toBeNull();
  });

  it("formats m:ss and longer durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65.8)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(undefined)).toBe("0:00");
  });
});

describe("idle mode decision", () => {
  it("shows the clock in clock mode even when music plays", () => {
    expect(decideIdleView({ mode: "clock", hasTrack: true, isPlaying: true })).toBe("clock");
  });

  it("shows music in auto mode only while playing", () => {
    expect(decideIdleView({ mode: "auto", hasTrack: true, isPlaying: true })).toBe("music");
    expect(decideIdleView({ mode: "auto", hasTrack: true, isPlaying: false })).toBe("clock");
    expect(decideIdleView({ mode: "auto", hasTrack: false, isPlaying: true })).toBe("clock");
  });

  it("freezes now playing for paused tracks in music mode", () => {
    expect(decideIdleView({ mode: "music", hasTrack: true, isPlaying: false })).toBe("music");
    expect(decideIdleView({ mode: "music", hasTrack: false, isPlaying: false })).toBe("clock");
  });

  it("shows widgets when an idle layout exists", () => {
    expect(decideIdleView({ mode: "widgets", hasTrack: true, isPlaying: true, hasWidgetLayout: true })).toBe("widgets");
  });

  it("falls back to the clock when the idle layout is missing or empty", () => {
    expect(decideIdleView({ mode: "widgets", hasTrack: true, isPlaying: true })).toBe("clock");
    expect(decideIdleView({ mode: "widgets", hasTrack: false, isPlaying: false, hasWidgetLayout: false })).toBe(
      "clock",
    );
  });
});

const lines: LyricLine[] = [
  {
    start: 0,
    end: 2,
    words: [
      { text: "Hello", start: 0, end: 1 },
      { text: "world", start: 1, end: 2 },
    ],
  },
  { start: 4, end: 0, words: [{ text: "again", start: 4, end: 6 }] },
];

describe("lyrics sync view", () => {
  it("has no active line before the first line", () => {
    expect(findActiveLineIndex(lines, null)).toBe(-1);
    expect(findActiveWordIndex(lines[0], -1)).toBe(-1);
  });

  it("selects the last line whose start has passed", () => {
    expect(findActiveLineIndex(lines, 1)).toBe(0);
    expect(findActiveLineIndex(lines, 5)).toBe(1);
    expect(findActiveLineIndex(lines, 999)).toBe(1);
  });

  it("highlights words within the active line", () => {
    expect(findActiveWordIndex(lines[0], 0)).toBe(0);
    expect(findActiveWordIndex(lines[0], 1)).toBe(1);
    expect(findActiveWordIndex(lines[0], 50)).toBe(1);
  });

  it("uses the configured end or falls back to the next line start", () => {
    expect(effectiveLineEnd(lines, 0)).toBe(2);
    expect(effectiveLineEnd(lines, 1)).toBe(6);
    expect(effectiveLineEnd([{ start: 0, end: 0, words: [] }], 0)).toBe(0);
  });

  it("builds a stable track key from identity or metadata", () => {
    const track = {
      mediaContentId: "spotify:track:abc",
      mediaTitle: "Title",
      mediaArtist: "Artist",
      mediaDuration: 42,
    };
    expect(buildTrackKey(track)).toBe(buildTrackKey(track));
    expect(buildTrackKey(track)).not.toBe(buildTrackKey({ ...track, mediaContentId: undefined }));
    expect(buildTrackKey({ mediaTitle: "A", mediaArtist: "B", mediaDuration: undefined })).toContain("|0");
  });

  it("syncs LRCLIB lines and word timings in seconds", () => {
    const lrclibLines: LyricLine[] = [
      {
        start: 12.5,
        end: 14.75,
        words: [
          { text: "I'm", start: 12.5, end: 12.9 },
          { text: " singing", start: 13.0, end: 13.6 },
          { text: " now", start: 13.8, end: 14.4 },
        ],
      },
      {
        start: 15.2,
        end: 17,
        words: [
          { text: "You're", start: 15.2, end: 15.8 },
          { text: " listening", start: 16, end: 16.7 },
        ],
      },
    ];

    expect(findActiveLineIndex(lrclibLines, 12.4)).toBe(-1);
    expect(findActiveLineIndex(lrclibLines, 13.5)).toBe(0);
    expect(findActiveLineIndex(lrclibLines, 16.5)).toBe(1);
    expect(findActiveWordIndex(lrclibLines[0], 12.7)).toBe(0);
    expect(findActiveWordIndex(lrclibLines[0], 13.2)).toBe(1);
    expect(findActiveWordIndex(lrclibLines[0], 14)).toBe(2);
    expect(findActiveWordIndex(lrclibLines[1], 15.9)).toBe(0);
    expect(findActiveWordIndex(lrclibLines[1], 16.5)).toBe(1);
  });
});
