"use client";

import { useEffect, useRef, useState } from "react";
import { ActionIcon, Group } from "@mantine/core";
import {
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

const controlVars = () => ({
  root: {
    "--ai-bg": "rgb(255 255 255 / 8%)",
    "--ai-hover": "rgb(255 255 255 / 18%)",
    "--ai-color": "rgb(255 255 255 / 88%)",
    "--ai-hover-color": "#fff",
  },
});
import type { LyricsViewData } from "./lyrics-view";
import { buildTrackKey } from "./lyrics-view";
import { formatDuration } from "./playback";
import { useLyrics } from "./use-lyrics";
import { usePlaybackClock } from "./use-playback-clock";

export const NowPlaying = ({
  entity,
  showLyrics,
  integrationId,
  entityId,
}: {
  entity: SmartHomeEntity;
  showLyrics: boolean;
  integrationId: string;
  entityId: string;
}) => {
  const t = useI18n("board");
  const [imageFailed, setImageFailed] = useState(false);
  const [seekOverrideAt, setSeekOverrideAt] = useState<number | undefined>(undefined);
  const pendingTrackDirection = useRef<"next" | "previous">("next");
  const utils = clientApi.useUtils();
  const { mutate: executeAction } = clientApi.widget.smartHome.executeAction.useMutation({
    // The live patch can be delayed; refresh the player state right away so
    // seeking back or skipping a track moves the progress bar immediately.
    onSuccess: () => void utils.widget.smartHome.snapshot.invalidate(),
  });
  const run = (action: "mediaPrevious" | "mediaPlayPause" | "mediaNext") => {
    if (action === "mediaNext") pendingTrackDirection.current = "next";
    if (action === "mediaPrevious") pendingTrackDirection.current = "previous";
    if (action !== "mediaPlayPause") setSeekOverrideAt(Date.now());
    executeAction({ integrationId, entityId, action });
  };
  const playing = entity.state === "playing";
  const attributes = entity.attributes;
  const title = attributes.mediaTitle?.trim() || entity.name;
  const artist = attributes.mediaArtist?.trim() || "";
  const album = attributes.mediaAlbum?.trim();
  const artwork = attributes.pictureUrl;
  const duration = Number.isFinite(attributes.mediaDuration) ? attributes.mediaDuration : undefined;

  // A new track identity remounts the column so the slide keyframe plays.
  // The direction comes from the button that caused the change; external
  // changes arrive as "next". No animation on the very first render.
  const trackKey = buildTrackKey(attributes);
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

  // Once HA reports real forward progress the optimistic seek can be dropped.
  useEffect(() => {
    if (seekOverrideAt !== undefined && (attributes.mediaPosition ?? 0) > 1) setSeekOverrideAt(undefined);
  }, [attributes.mediaPosition, seekOverrideAt]);

  const position = usePlaybackClock({
    state: entity.state,
    mediaPosition: attributes.mediaPosition,
    mediaPositionUpdatedAt: attributes.mediaPositionUpdatedAt,
    mediaDuration: duration,
    enabled: true,
    seekOverrideAt,
  });

  const lyricsQuery = useLyrics({
    enabled: showLyrics && Boolean(attributes.mediaTitle),
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

  return (
    <div className={classes.musicRoot}>
      {hasArtwork && (
        <div className={classes.musicBackdrop} style={{ backgroundImage: `url("${artwork}")` }} aria-hidden="true" />
      )}
      <div className={classes.musicScrim} aria-hidden="true" />

      <div className={`${classes.musicContent} ${lyrics ? classes.musicTwoColumns : classes.musicOneColumn}`}>
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
                disabled={!supportsSmartHomeAction(entity, { type: "mediaPrevious" })}
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
                disabled={!supportsSmartHomeAction(entity, { type: "mediaPlayPause" })}
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
                disabled={!supportsSmartHomeAction(entity, { type: "mediaNext" })}
                onClick={() => run("mediaNext")}
              >
                <IconPlayerSkipForward size={26} fill="currentColor" />
              </ActionIcon>
            </Group>
          </div>
        </div>

        {lyrics && <LyricsPanel lyrics={lyrics} position={position} />}
      </div>
      <span className={classes.srOnly} aria-live="off">
        {`${title}${artist ? ` — ${artist}` : ""}`}
      </span>
    </div>
  );
};
