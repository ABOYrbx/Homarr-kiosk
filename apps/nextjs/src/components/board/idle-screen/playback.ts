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
    // A seek anchor keeps counting locally even when the player stops sending
    // fresh reports. Freezing at the reported 0 would rewind the bar on pause.
    const frozen = seekAnchorAt !== undefined ? base + Math.max(0, (now - seekAnchorAt) / 1000) : base;
    return duration !== undefined ? clamp(frozen, 0, Math.max(0, duration)) : frozen;
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

const SEEK_REPORT_TOLERANCE_MS = 2_000;

/**
 * The optimistic zero anchor stays until the player confirms forward progress
 * with a fresh report. Snapshot responses are cached for a few seconds, so a
 * high position with an old timestamp is the previous track, not progress on
 * the one the user just skipped to.
 */
export const shouldClearSeekOverride = ({
  seekOverrideAt,
  mediaPosition,
  mediaPositionUpdatedAt,
}: {
  seekOverrideAt: number | undefined;
  mediaPosition: number | undefined;
  mediaPositionUpdatedAt: number | undefined;
}): boolean =>
  seekOverrideAt !== undefined &&
  (mediaPosition ?? 0) > 1 &&
  mediaPositionUpdatedAt !== undefined &&
  mediaPositionUpdatedAt >= seekOverrideAt - SEEK_REPORT_TOLERANCE_MS;

const STALE_REPORT_MS = 2_000;

/**
 * HA reports may come from another device (a seek in Music Assistant, for
 * example) and can keep an old `media_position_updated_at`. Anchor the clock at
 * the moment such a report arrives: the bar then jumps back with the seek and
 * keeps moving instead of extrapolating from stale data and freezing at the
 * position-age cap. Fresh reports continue to use HA's own timestamp.
 */
export const resolvePositionAnchorAt = ({
  previousPosition,
  mediaPosition,
  mediaPositionUpdatedAt,
  now,
}: {
  previousPosition: number | undefined;
  mediaPosition: number | undefined;
  mediaPositionUpdatedAt: number | undefined;
  now: number;
}): number | undefined => {
  if (mediaPosition === undefined) return undefined;
  if (isBackwardSeek(previousPosition, mediaPosition)) return now;
  if (mediaPositionUpdatedAt !== undefined && now - mediaPositionUpdatedAt > STALE_REPORT_MS) return now;
  return undefined;
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
 * Shift only the position fed to the lyrics view. A positive offset delays
 * the highlight (earlier position), a negative one advances it. A missing
 * playback position stays missing.
 */
export const offsetLyricsPosition = (position: number | null, offsetSeconds: number): number | null =>
  position === null ? null : position - offsetSeconds;

/**
 * Mode decision for the idle screen. A loaded track stays visible in the music
 * layer even while paused; the carousel decides when to leave that layer.
 */
export const decideIdleView = ({
  mode,
  hasTrack,
  hasWidgetLayout = false,
}: {
  mode: IdleScreenMode;
  hasTrack: boolean;
  hasWidgetLayout?: boolean;
}): IdleView => {
  if (mode === "widgets") return hasWidgetLayout ? "widgets" : "clock";
  if (mode === "clock") return "clock";
  if (mode === "music") return hasTrack ? "music" : "clock";
  // A paused track stays visible in the music layer; the carousel decides
  // when to leave it after playback stopped.
  return hasTrack ? "music" : "clock";
};
