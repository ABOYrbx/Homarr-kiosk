export type IdleScreenMode = "auto" | "clock" | "music" | "widgets";
export type IdleView = "clock" | "music" | "widgets";

export interface PlaybackState {
  state?: string;
  mediaPosition?: number;
  mediaPositionUpdatedAt?: number;
  mediaDuration?: number;
  mediaTitle?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * HA players that do not report live progress keep their original
 * `media_position_updated_at` forever. Extrapolating from such a timestamp
 * races the lyrics far ahead of the audio, so the local clock only ever
 * advances this far without a fresh position report.
 */
const MAX_POSITION_AGE_SECONDS = 30;

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
  seekAnchorAt,
}: PlaybackState & { now: number; seekAnchorAt?: number }): number | null => {
  if (!Number.isFinite(mediaPosition)) return null;
  const base = Math.max(0, mediaPosition as number);
  const duration = Number.isFinite(mediaDuration) ? (mediaDuration as number) : undefined;

  if (state !== "playing" || !Number.isFinite(mediaPositionUpdatedAt)) {
    return duration !== undefined ? clamp(base, 0, Math.max(0, duration)) : base;
  }

  // After a seek, HA may keep reporting the old position_updated_at. Anchor the
  // clock at the moment of the seek so it does not extrapolate from stale data.
  const elapsed = Math.max(0, (now - (seekAnchorAt ?? (mediaPositionUpdatedAt as number))) / 1000);
  // The cap protects against permanently stale HA timestamps. A fresh seek
  // anchor must keep advancing normally, otherwise the bar freezes at 30 s.
  const elapsedSeconds = seekAnchorAt !== undefined ? elapsed : Math.min(MAX_POSITION_AGE_SECONDS, elapsed);
  const position = base + elapsedSeconds;
  return duration !== undefined ? clamp(position, 0, Math.max(0, duration)) : position;
};

/** A lower reported position means the user seeked backwards. */
export const isBackwardSeek = (previous: number | undefined, next: number | undefined): boolean =>
  previous !== undefined && next !== undefined && next < previous - 1;

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
  hasWidgetLayout = false,
}: {
  mode: IdleScreenMode;
  hasTrack: boolean;
  isPlaying: boolean;
  hasWidgetLayout?: boolean;
}): IdleView => {
  if (mode === "widgets") return hasWidgetLayout ? "widgets" : "clock";
  if (mode === "clock") return "clock";
  if (mode === "music") return hasTrack ? "music" : "clock";
  return hasTrack && isPlaying ? "music" : "clock";
};
