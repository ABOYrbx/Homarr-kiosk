"use client";

import { useEffect, useRef, useState } from "react";
import { ActionIcon, Group } from "@mantine/core";
import {
  IconList,
  IconMessage,
  IconMusic,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import type { SmartHomeEntity } from "@homarr/integrations/types";
import { supportsSmartHomeAction } from "@homarr/integrations/types";
import { useI18n } from "@homarr/translation/client";

import classes from "./idle-screen.module.css";
import { LyricsPanel } from "./lyrics-panel";
import type { MusicTrack } from "./music-track";
import { QueuePanel } from "./queue-panel";
import type { QueueView } from "./use-music-assistant-queue";

export type MusicControlAction = "mediaPrevious" | "mediaPlayPause" | "mediaNext";
/** MA also accepts seeking; the renderer only exposes the three player buttons. */
export type MusicAssistantControlAction = MusicControlAction | "seek";

/**
 * Home Assistant control wiring. Kept outside the renderer so the same
 * NowPlaying view can be driven by Music Assistant as well.
 */
export const useHomeAssistantMusicControls = ({
  entity,
  integrationId,
  entityId,
}: {
  entity: SmartHomeEntity | undefined;
  integrationId: string;
  entityId: string;
}): {
  onControl: (action: MusicControlAction) => void;
  canControl: (action: MusicControlAction) => boolean;
} => {
  const utils = clientApi.useUtils();
  const { mutate: executeAction } = clientApi.widget.smartHome.executeAction.useMutation({
    // The live patch can be delayed; refresh the player state right away so
    // seeking back or skipping a track moves the progress bar immediately.
    onSuccess: () => void utils.widget.smartHome.snapshot.invalidate(),
  });

  return {
    onControl: (action) => executeAction({ integrationId, entityId, action }),
    canControl: (action) => entity !== undefined && supportsSmartHomeAction(entity, { type: action }),
  };
};

const toMusicAssistantAction = (action: MusicAssistantControlAction): "previous" | "play_pause" | "next" | "seek" => {
  if (action === "mediaPrevious") return "previous";
  if (action === "mediaNext") return "next";
  if (action === "seek") return "seek";
  return "play_pause";
};

/**
 * Music Assistant control wiring. The integration does not report per-action
 * capabilities, so the actions it implements are available whenever a track
 * exists. Seeks always carry the current track position: MA requires it.
 */
export const useMusicAssistantMusicControls = ({
  integrationId,
  queueId,
  track,
}: {
  integrationId: string;
  queueId: string;
  track: MusicTrack | undefined;
}): {
  onControl: (action: MusicAssistantControlAction) => void;
  canControl: (action: MusicAssistantControlAction) => boolean;
} => {
  const utils = clientApi.useUtils();
  const { mutate: control } = clientApi.musicAssistant.control.useMutation({
    onSuccess: () => void utils.musicAssistant.nowPlaying.invalidate({ integrationId }),
  });

  return {
    onControl: (action) =>
      control({
        integrationId,
        queueId,
        action: toMusicAssistantAction(action),
        ...(action === "seek" ? { positionSeconds: track?.positionSeconds ?? 0 } : {}),
      }),
    canControl: () => track !== undefined,
  };
};

const controlVars = () => ({
  root: {
    "--ai-bg": "rgb(255 255 255 / 8%)",
    "--ai-hover": "rgb(255 255 255 / 18%)",
    "--ai-color": "rgb(255 255 255 / 88%)",
    "--ai-hover-color": "#fff",
  },
});

// Same translucent styling as the playback controls, with the selected view
// held at a slightly stronger fill.
const activeControlVars = () => ({
  root: {
    "--ai-bg": "rgb(255 255 255 / 22%)",
    "--ai-hover": "rgb(255 255 255 / 18%)",
    "--ai-color": "rgb(255 255 255 / 88%)",
    "--ai-hover-color": "#fff",
  },
});
import type { LyricsViewData } from "./lyrics-view";
import { buildTrackKey } from "./lyrics-view";
import { formatDuration, offsetLyricsPosition, shouldClearSeekOverride } from "./playback";
import { useLyrics } from "./use-lyrics";
import { usePlaybackClock } from "./use-playback-clock";

export const NowPlaying = ({
  track,
  onControl,
  canControl,
  showLyrics,
  lyricsOffsetSeconds,
  queue,
  queueAvailable,
}: {
  track: MusicTrack;
  onControl: (action: MusicControlAction) => void;
  canControl: (action: MusicControlAction) => boolean;
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
  queue: QueueView | undefined;
  queueAvailable: boolean;
}) => {
  const t = useI18n("board");
  // Local to this mount: closing the AOD unmounts the music layer and resets
  // the view to the default. Lyrics stay the default whenever they are enabled.
  // "none" means the lyrics button has hidden the side panel.
  const [activeView, setActiveView] = useState<"lyrics" | "queue" | "none">(showLyrics ? "lyrics" : "queue");
  const [imageFailed, setImageFailed] = useState(false);
  const [seekOverrideAt, setSeekOverrideAt] = useState<number | undefined>(undefined);
  const pendingTrackDirection = useRef<"next" | "previous">("next");
  const run = (action: MusicControlAction) => {
    if (action === "mediaNext") pendingTrackDirection.current = "next";
    if (action === "mediaPrevious") pendingTrackDirection.current = "previous";
    if (action !== "mediaPlayPause") setSeekOverrideAt(Date.now());
    onControl(action);
  };
  const playing = track.state === "playing";
  const title = track.title;
  const artist = track.artist;
  const album = track.album;
  const artwork = track.artworkUrl;
  const duration = track.durationSeconds;

  // A new track identity remounts the column so the slide keyframe plays.
  // The direction comes from the button that caused the change; external
  // changes arrive as "next". No animation on the very first render.
  const trackKey = buildTrackKey({
    mediaContentId: track.mediaContentId,
    mediaTitle: track.title,
    mediaArtist: track.artist,
    mediaDuration: track.durationSeconds,
  });
  const trackMotion = useRef<{ key: string; className: string | undefined }>({ key: trackKey, className: undefined });
  if (trackMotion.current.key !== trackKey) {
    trackMotion.current = {
      key: trackKey,
      className: pendingTrackDirection.current === "previous" ? classes.trackEnterPrevious : classes.trackEnterNext,
    };
    pendingTrackDirection.current = "next";
  }

  // A failed cover belongs to one track only; a new artwork gets a new chance.
  useEffect(() => setImageFailed(false), [artwork]);

  // A new track always starts at zero. HA can briefly keep reporting the old
  // position (or the snapshot can be cached), so the track identity is the
  // reliable signal that the bar has to restart.
  const seekTrackKey = useRef(trackKey);
  useEffect(() => {
    if (seekTrackKey.current === trackKey) return;
    seekTrackKey.current = trackKey;
    setSeekOverrideAt(Date.now());
  }, [trackKey]);

  // Once the player reports real forward progress the optimistic seek can be dropped.
  useEffect(() => {
    if (
      shouldClearSeekOverride({
        seekOverrideAt,
        mediaPosition: track.positionSeconds,
        mediaPositionUpdatedAt: track.positionUpdatedAt,
      })
    )
      setSeekOverrideAt(undefined);
  }, [track.positionSeconds, track.positionUpdatedAt, seekOverrideAt]);

  const position = usePlaybackClock({
    state: track.state,
    mediaPosition: track.positionSeconds,
    mediaPositionUpdatedAt: track.positionUpdatedAt,
    mediaDuration: duration,
    enabled: true,
    seekOverrideAt,
  });

  const lyricsQuery = useLyrics({
    enabled: showLyrics && Boolean(track.title),
    title,
    artist,
    album,
    durationSeconds: duration !== undefined ? Math.max(1, Math.min(3600, Math.round(duration))) : undefined,
  });
  const found = lyricsQuery.data?.status === "found" ? lyricsQuery.data : undefined;
  const lyrics: LyricsViewData | undefined = found?.lines?.length
    ? {
        type: found.type ?? "static",
        lines: found.lines,
        source: found.source,
        provider: found.provider,
      }
    : undefined;
  const hasArtwork = Boolean(artwork) && !imageFailed;
  const progress = position !== null && duration !== undefined && duration > 0 ? (position / duration) * 100 : null;
  const hasSidePanel = activeView === "none" ? false : activeView === "lyrics" ? Boolean(lyrics) : true;

  return (
    <div className={classes.musicRoot}>
      {hasArtwork && (
        <div className={classes.musicBackdrop} style={{ backgroundImage: `url("${artwork}")` }} aria-hidden="true" />
      )}
      <div className={classes.musicScrim} aria-hidden="true" />

      <div className={`${classes.musicContent} ${hasSidePanel ? classes.musicTwoColumns : classes.musicOneColumn}`}>
        <div
          key={trackKey}
          className={`${classes.trackColumn}${trackMotion.current.className ? ` ${trackMotion.current.className}` : ""}`}
        >
          {hasArtwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artwork}
              alt=""
              className={classes.cover}
              draggable={false}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className={classes.cover} aria-hidden="true">
              <div className={classes.coverFallback}>
                <IconMusic size={96} stroke={1.2} />
              </div>
            </div>
          )}
          <div className={classes.trackDetails}>
            <h1 className={classes.trackTitle} title={title}>
              {title}
            </h1>
            {artist && (
              <p className={classes.trackArtist} title={artist}>
                {artist}
              </p>
            )}
            {album && (
              <p className={classes.trackAlbum} title={album}>
                {album}
              </p>
            )}
            <div className={classes.progressWrapper}>
              <div
                className={classes.progressTrack}
                role="progressbar"
                aria-label={t("idleScreen.progressLabel")}
                aria-valuemin={0}
                aria-valuemax={duration ?? 0}
                aria-valuenow={position ?? 0}
              >
                {progress !== null && <div className={classes.progressFill} style={{ width: `${progress}%` }} />}
              </div>
              <div className={classes.progressTimes}>
                <span>{formatDuration(position)}</span>
                {duration !== undefined && <span>{formatDuration(duration)}</span>}
              </div>
            </div>
            <Group className={classes.playbackControls} gap="sm" justify="center" wrap="nowrap">
              <ActionIcon
                variant="subtle"
                size={54}
                radius="xl"
                vars={controlVars}
                aria-label={t("idleScreen.previousTrack")}
                disabled={!canControl("mediaPrevious")}
                onClick={() => run("mediaPrevious")}
              >
                <IconPlayerSkipBack size={26} fill="currentColor" />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size={64}
                radius="xl"
                vars={controlVars}
                aria-label={t("idleScreen.playPause")}
                disabled={!canControl("mediaPlayPause")}
                onClick={() => run("mediaPlayPause")}
              >
                {playing ? (
                  <IconPlayerPause size={30} fill="currentColor" />
                ) : (
                  <IconPlayerPlay size={30} fill="currentColor" />
                )}
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size={54}
                radius="xl"
                vars={controlVars}
                aria-label={t("idleScreen.nextTrack")}
                disabled={!canControl("mediaNext")}
                onClick={() => run("mediaNext")}
              >
                <IconPlayerSkipForward size={26} fill="currentColor" />
              </ActionIcon>
            </Group>
          </div>
        </div>

        {activeView === "lyrics" && lyrics && (
          <LyricsPanel lyrics={lyrics} position={offsetLyricsPosition(position, lyricsOffsetSeconds)} />
        )}
        {activeView === "queue" && <QueuePanel queue={queue} />}
      </div>

      <Group className={classes.viewSwitch} gap="sm" justify="flex-end" wrap="nowrap" data-idle-interactive>
        <ActionIcon
          variant="subtle"
          size={54}
          radius="xl"
          vars={activeView === "lyrics" ? activeControlVars : controlVars}
          aria-label={t("idleScreen.lyricsButton")}
          aria-pressed={activeView === "lyrics"}
          disabled={!showLyrics}
          onClick={() => setActiveView((current) => (current === "lyrics" ? "none" : "lyrics"))}
        >
          <IconMessage size={26} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          size={54}
          radius="xl"
          vars={activeView === "queue" ? activeControlVars : controlVars}
          aria-label={t("idleScreen.queueButton")}
          aria-pressed={activeView === "queue"}
          disabled={!queueAvailable}
          onClick={() => setActiveView("queue")}
        >
          <IconList size={26} />
        </ActionIcon>
      </Group>
      <span className={classes.srOnly} aria-live="off">
        {`${title}${artist ? ` — ${artist}` : ""}`}
      </span>
    </div>
  );
};
