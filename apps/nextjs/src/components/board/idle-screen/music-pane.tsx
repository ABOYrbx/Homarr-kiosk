"use client";

import { Center, Stack, Text } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

import { useI18n } from "@homarr/translation/client";

import type { MusicTrack } from "./music-track";
import { NowPlaying, useHomeAssistantMusicControls, useMusicAssistantMusicControls } from "./now-playing";
import { useMusicAssistantQueue } from "./use-music-assistant-queue";
import type { MusicSourceSettings } from "./use-music-source";
import { useMusicSource } from "./use-music-source";
import { useNowPlaying } from "./use-now-playing";

export type MusicPaneState = "not-configured" | "no-track" | "ready";

export const getMusicPaneState = ({
  integrationId,
  entityId,
  entity,
}: {
  integrationId: string | null;
  entityId: string | null;
  entity: { state?: string; attributes?: { mediaTitle?: string } } | null;
  hasArtwork: boolean;
}): MusicPaneState => {
  if (!integrationId || !entityId) return "not-configured";
  if (!entity || (!entity.attributes?.mediaTitle && entity.state !== "playing")) return "no-track";
  return "ready";
};

const MusicPaneMessage = ({ message }: { message: string }) => (
  <Center h="100%" p="xl">
    <Stack align="center" gap="lg">
      <IconMusic size={48} stroke={1.2} color="var(--mantine-color-gray-6)" aria-hidden="true" />
      <Text c="gray.4" size="lg" ta="center">
        {message}
      </Text>
    </Stack>
  </Center>
);

type PaneContentProps = {
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
  loadingMessage: string;
};

/** HA controls still need the live entity for its reported action capabilities. */
const HomeAssistantTrackPane = ({
  track,
  queueSelection,
  showLyrics,
  lyricsOffsetSeconds,
  loadingMessage,
}: PaneContentProps & {
  track: MusicTrack;
  queueSelection: { integrationId: string; queueId: string } | undefined;
}) => {
  const { entity } = useNowPlaying({ integrationId: track.integrationId, entityId: track.playerId });
  const { onControl, canControl } = useHomeAssistantMusicControls({
    entity,
    integrationId: track.integrationId,
    entityId: track.playerId,
  });
  const { queue } = useMusicAssistantQueue({
    integrationId: queueSelection?.integrationId ?? null,
    queueId: queueSelection?.queueId ?? null,
    enabled: Boolean(queueSelection),
  });

  if (!entity) return <MusicPaneMessage message={loadingMessage} />;

  return (
    <NowPlaying
      track={track}
      onControl={onControl}
      canControl={canControl}
      showLyrics={showLyrics}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      queue={queue}
      queueAvailable={Boolean(queueSelection && queue?.tracks.length)}
    />
  );
};

/** The selected MA queue keeps its own queue view in auto and fixed mode. */
const MusicAssistantTrackPane = ({
  track,
  showLyrics,
  lyricsOffsetSeconds,
}: PaneContentProps & { track: MusicTrack }) => {
  const { onControl, canControl } = useMusicAssistantMusicControls({
    integrationId: track.integrationId,
    queueId: track.playerId,
    track,
  });
  const { queue } = useMusicAssistantQueue({
    integrationId: track.integrationId,
    queueId: track.playerId,
    enabled: true,
  });

  return (
    <NowPlaying
      track={track}
      onControl={onControl}
      canControl={canControl}
      showLyrics={showLyrics}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      queue={queue}
      queueAvailable={Boolean(queue?.tracks.length)}
    />
  );
};

/**
 * Both selection modes render from the same normalized track. This pane is
 * mounted only while the carousel shows the music layer inside the open
 * overlay, so none of these subscriptions exist on the dashboard.
 */
export const MusicPane = ({
  settings,
  showLyrics,
  lyricsOffsetSeconds,
}: {
  settings: MusicSourceSettings;
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
}) => {
  const t = useI18n("board");
  const { track, isLoading } = useMusicSource(settings);

  const paneProps = {
    showLyrics,
    lyricsOffsetSeconds,
    loadingMessage: t("idleScreen.music.loading"),
  };
  const configured = settings.idleScreenMusicSources.some((source) =>
    source === "homeAssistant"
      ? Boolean(settings.idleScreenHomeAssistantIntegrationId)
      : Boolean(settings.idleScreenMusicAssistantIntegrationId),
  );
  const configuredQueue =
    settings.idleScreenMusicAssistantIntegrationId && settings.idleScreenMusicAssistantQueueId
      ? {
          integrationId: settings.idleScreenMusicAssistantIntegrationId,
          queueId: settings.idleScreenMusicAssistantQueueId,
        }
      : undefined;

  if (!configured) return <MusicPaneMessage message={t("idleScreen.music.notConfigured")} />;
  if (isLoading) return <MusicPaneMessage message={paneProps.loadingMessage} />;
  if (!track) return <MusicPaneMessage message={t("idleScreen.music.nothingPlaying")} />;

  if (track.source === "homeAssistant") {
    return <HomeAssistantTrackPane track={track} queueSelection={configuredQueue} {...paneProps} />;
  }
  return <MusicAssistantTrackPane track={track} {...paneProps} />;
};
