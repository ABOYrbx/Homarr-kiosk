"use client";

import { useEffect, useState } from "react";

import type { PlaybackState } from "./playback";
import { computePlaybackPosition } from "./playback";

const TICK_MS = 250;

/**
 * Keeps a 250 ms clock for the progress bar and syllable highlighting. The
 * interval only exists while the track is playing; a paused track freezes.
 */
export const usePlaybackClock = ({
  state,
  mediaPosition,
  mediaPositionUpdatedAt,
  mediaDuration,
  enabled,
}: PlaybackState & { enabled: boolean }): number | null => {
  const [now, setNow] = useState(() => Date.now());
  const playing = enabled && state === "playing";

  useEffect(() => {
    setNow(Date.now());
  }, [mediaPositionUpdatedAt]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [playing]);

  return computePlaybackPosition({
    state,
    mediaPosition,
    mediaPositionUpdatedAt,
    mediaDuration,
    now,
  });
};
