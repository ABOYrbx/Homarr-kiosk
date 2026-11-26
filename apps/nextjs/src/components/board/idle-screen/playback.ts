export type IdleScreenMode = "auto" | "clock" | "music";
export type IdleView = "clock" | "music";

export interface PlaybackState {
  state?: string;
  mediaPosition?: number;
  mediaPositionUpdatedAt?: number;
  mediaDuration?: number;
  mediaTitle?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Rebase the reported position on the timestamp HA attached to it, but only
 * while playing. Paused or stopped tracks freeze at their reported position.
 * Returns null when the integration did not report a usable position.
 */
export const computePlaybackPosition = ({
  state,
  mediaPosition,
  mediaPositionUpdatedAt,
  mediaDuration,
  now,
}: PlaybackState & { now: number }): number | null => {
  if (!Number.isFinite(mediaPosition)) return null;
  const base = Math.max(0, mediaPosition as number);
  const duration = Number.isFinite(mediaDuration) ? (mediaDuration as number) : undefined;

  if (state !== "playing" || !Number.isFinite(mediaPositionUpdatedAt)) {
    return duration !== undefined ? clamp(base, 0, Math.max(0, duration)) : base;
  }

  const elapsedSeconds = Math.max(0, (now - (mediaPositionUpdatedAt as number)) / 1000);
  const position = base + elapsedSeconds;
  return duration !== undefined ? clamp(position, 0, Math.max(0, duration)) : position;
};

/** Compact m:ss (or h:mm:ss for long tracks) display used by the progress bar. */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

/**
 * Mode decision for the idle screen. `auto` only switches to music while a
 * track is actually playing; `music` keeps a frozen view for paused tracks.
 */
export const decideIdleView = ({
  mode,
  hasTrack,
  isPlaying,
}: {
  mode: IdleScreenMode;
  hasTrack: boolean;
  isPlaying: boolean;
}): IdleView => {
  if (mode === "clock") return "clock";
  if (mode === "music") return hasTrack ? "music" : "clock";
  return hasTrack && isPlaying ? "music" : "clock";
};
