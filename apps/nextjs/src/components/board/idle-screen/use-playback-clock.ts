"use client";

import { useEffect, useRef, useState } from "react";

import type { PlaybackState } from "./playback";
import { computePlaybackPosition, isBackwardSeek } from "./playback";

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
  const reportedPosition = useRef<number | undefined>(mediaPosition);

  useEffect(() => {
    // A rewind must move the lyrics back with the audio. Anchor the clock at
    // the new timestamp so no leftover extrapolation keeps the old position.
    const seekedBack = isBackwardSeek(reportedPosition.current, mediaPosition);
    reportedPosition.current = mediaPosition;
    setNow(seekedBack ? (mediaPositionUpdatedAt ?? Date.now()) : Date.now());
  }, [mediaPosition, mediaPositionUpdatedAt]);

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
