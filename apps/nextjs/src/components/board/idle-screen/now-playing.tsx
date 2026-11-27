"use client";

import { useEffect, useState } from "react";
import { IconMusic } from "@tabler/icons-react";

import type { SmartHomeEntity } from "@homarr/integrations/types";
import { useI18n } from "@homarr/translation/client";

import classes from "./idle-screen.module.css";
import { LyricsPanel } from "./lyrics-panel";
import type { LyricsViewData } from "./lyrics-view";
import { formatDuration } from "./playback";
import { useLyrics } from "./use-lyrics";
import { usePlaybackClock } from "./use-playback-clock";

export const NowPlaying = ({ entity, showLyrics }: { entity: SmartHomeEntity; showLyrics: boolean }) => {
  const t = useI18n("board");
  const [imageFailed, setImageFailed] = useState(false);
  const attributes = entity.attributes;
  const title = attributes.mediaTitle?.trim() || entity.name;
  const artist = attributes.mediaArtist?.trim() || "";
  const album = attributes.mediaAlbum?.trim();
  const artwork = attributes.pictureUrl;
  const duration = Number.isFinite(attributes.mediaDuration) ? attributes.mediaDuration : undefined;

  // A failed cover belongs to one track only; a new artwork gets a new chance.
  useEffect(() => setImageFailed(false), [artwork]);

  const position = usePlaybackClock({
    state: entity.state,
    mediaPosition: attributes.mediaPosition,
    mediaPositionUpdatedAt: attributes.mediaPositionUpdatedAt,
    mediaDuration: duration,
    enabled: true,
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
        <div className={classes.trackColumn}>
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
