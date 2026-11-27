"use client";

import { Center, Stack, Text } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

import { useI18n } from "@homarr/translation/client";

import { NowPlaying } from "./now-playing";
import type { QueueView } from "./use-music-assistant-queue";
import { useMusicAssistantQueue } from "./use-music-assistant-queue";
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

const ConfiguredMusicPane = ({
  integrationId,
  entityId,
  musicAssistantIntegrationId,
  musicAssistantQueueId,
  queue,
  showLyrics,
  lyricsOffsetSeconds,
  emptyMessage,
  loadingMessage,
}: {
  integrationId: string;
  entityId: string;
  musicAssistantIntegrationId: string | null;
  musicAssistantQueueId: string | null;
  queue: QueueView | undefined;
  showLyrics: boolean;
  lyricsOffsetSeconds: number;
  emptyMessage: string;
  loadingMessage: string;
}) => {
  const { entity, isLoading } = useNowPlaying({ integrationId, entityId });

  if (isLoading) return <MusicPaneMessage message={loadingMessage} />;

  const state = getMusicPaneState({
    integrationId,
    entityId,
    entity: entity ?? null,
    hasArtwork: Boolean(entity?.attributes.pictureUrl),
  });

  if (state !== "ready" || !entity) return <MusicPaneMessage message={emptyMessage} />;
  return (
    <NowPlaying
      entity={entity}
      showLyrics={showLyrics}
      integrationId={integrationId}
      entityId={entityId}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      queue={queue}
      queueAvailable={Boolean(musicAssistantIntegrationId && musicAssistantQueueId && queue?.tracks.length)}
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

  if (!integrationId || !entityId) {
    return <MusicPaneMessage message={t("idleScreen.music.notConfigured")} />;
  }

  return (
    <ConfiguredMusicPane
      integrationId={integrationId}
      entityId={entityId}
      musicAssistantIntegrationId={musicAssistantIntegrationId}
      musicAssistantQueueId={musicAssistantQueueId}
      queue={queue}
      showLyrics={showLyrics}
      lyricsOffsetSeconds={lyricsOffsetSeconds}
      emptyMessage={t("idleScreen.music.nothingPlaying")}
      loadingMessage={t("idleScreen.music.loading")}
    />
  );
};
