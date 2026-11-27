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
  seekOverrideAt,
}: PlaybackState & { enabled: boolean; seekOverrideAt?: number }): number | null => {
  const [now, setNow] = useState(() => Date.now());
  const playing = enabled && state === "playing";

  useEffect(() => {
    // Rebase the local clock when the player reports a fresh position.
    setNow(Date.now());
  }, [mediaPosition, mediaPositionUpdatedAt]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [playing]);

  return computePlaybackPosition({
    state,
    // While the optimistic seek is active, show position 0 regardless of the
    // old entity value; HA may need a moment to report the new track.
    mediaPosition: seekOverrideAt !== undefined ? 0 : mediaPosition,
    mediaPositionUpdatedAt,
    mediaDuration,
    now,
    seekAnchorAt: seekOverrideAt,
  });
};
