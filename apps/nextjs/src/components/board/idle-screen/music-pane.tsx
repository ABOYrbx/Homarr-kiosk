"use client";

import { Center, Stack, Text } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

import { useI18n } from "@homarr/translation/client";

import { fromSmartHomeEntity } from "./music-track";
import { NowPlaying, useHomeAssistantMusicControls, useMusicAssistantMusicControls } from "./now-playing";
import type { QueueView } from "./use-music-assistant-queue";
import { useMusicAssistantQueue } from "./use-music-assistant-queue";
import { useMusicAssistantNowPlaying } from "./use-music-assistant-now-playing";
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

type MusicAssistantSelection = { integrationId: string; queueId: string };

type PaneContentProps = {
  queue: QueueView | undefined;
  queueAvailable: boolean;
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
  emptyMessage: string;
  loadingMessage: string;
};

/** Renders the currently playing track of the configured MA queue. */
const MusicAssistantPane = ({
  musicAssistant,
  queue,
  queueAvailable,
  showLyrics,
  lyricsOffsetSeconds,
  emptyMessage,
  loadingMessage,
}: PaneContentProps & { musicAssistant: MusicAssistantSelection }) => {
  const { tracks, isLoading } = useMusicAssistantNowPlaying({
    integrationId: musicAssistant.integrationId,
    queueId: musicAssistant.queueId,
    enabled: true,
  });
  const track = tracks[0];
  const { onControl, canControl } = useMusicAssistantMusicControls({ ...musicAssistant, track });

  if (isLoading) return <MusicPaneMessage message={loadingMessage} />;
  if (!track) return <MusicPaneMessage message={emptyMessage} />;

  return (
    <NowPlaying
      track={track}
      onControl={onControl}
      canControl={canControl}
      showLyrics={showLyrics}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      queue={queue}
      queueAvailable={queueAvailable}
    />
  );
};

const ConfiguredMusicPane = ({
  integrationId,
  entityId,
  musicAssistant,
  queue,
  queueAvailable,
  showLyrics,
  lyricsOffsetSeconds,
  emptyMessage,
  loadingMessage,
}: PaneContentProps & {
  integrationId: string;
  entityId: string;
  musicAssistant: MusicAssistantSelection | undefined;
}) => {
  const { entity, isLoading } = useNowPlaying({ integrationId, entityId });
  const { onControl, canControl } = useHomeAssistantMusicControls({ entity, integrationId, entityId });
  const track = entity ? fromSmartHomeEntity(entity, integrationId) : undefined;
  const maPaneProps = { queue, queueAvailable, showLyrics, lyricsOffsetSeconds, emptyMessage, loadingMessage };

  if (isLoading) return <MusicPaneMessage message={loadingMessage} />;

  const state = getMusicPaneState({
    integrationId,
    entityId,
    entity: entity ?? null,
    hasArtwork: Boolean(entity?.attributes.pictureUrl),
  });

  if (state !== "ready" || !track) {
    return musicAssistant ? (
      <MusicAssistantPane musicAssistant={musicAssistant} {...maPaneProps} />
    ) : (
      <MusicPaneMessage message={emptyMessage} />
    );
  }

  return (
    <NowPlaying
      track={track}
      onControl={onControl}
      canControl={canControl}
      showLyrics={showLyrics}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      queue={queue}
      queueAvailable={queueAvailable}
    />
  );
};

export const MusicPane = ({
  integrationId,
  entityId,
  musicAssistantIntegrationId,
  musicAssistantQueueId,
  showLyrics,
  lyricsOffsetSeconds,
}: {
  integrationId: string | null;
  entityId: string | null;
  musicAssistantIntegrationId: string | null;
  musicAssistantQueueId: string | null;
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
}) => {
  const t = useI18n("board");
  // This pane is mounted only while the carousel shows the music layer, so
  // the queue is never polled on the dashboard or on the other layers.
  const { queue } = useMusicAssistantQueue({
    integrationId: musicAssistantIntegrationId,
    queueId: musicAssistantQueueId,
    enabled: true,
  });

  const homeAssistant = integrationId && entityId ? { integrationId, entityId } : undefined;
  const musicAssistant =
    musicAssistantIntegrationId && musicAssistantQueueId
      ? { integrationId: musicAssistantIntegrationId, queueId: musicAssistantQueueId }
      : undefined;
  const paneProps = {
    queue,
    queueAvailable: Boolean(musicAssistant && queue?.tracks.length),
    showLyrics,
    lyricsOffsetSeconds,
    emptyMessage: t("idleScreen.music.nothingPlaying"),
    loadingMessage: t("idleScreen.music.loading"),
  };

  if (homeAssistant) {
    return <ConfiguredMusicPane {...homeAssistant} musicAssistant={musicAssistant} {...paneProps} />;
  }
  if (musicAssistant) {
    return <MusicAssistantPane musicAssistant={musicAssistant} {...paneProps} />;
  }

  return <MusicPaneMessage message={t("idleScreen.music.notConfigured")} />;
};
