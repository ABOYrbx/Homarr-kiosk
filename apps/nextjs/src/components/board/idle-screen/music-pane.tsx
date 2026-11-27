"use client";

import { Center, Stack, Text } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

import { useI18n } from "@homarr/translation/client";

import { AnalogClock } from "./analog-clock";
import { NowPlaying } from "./now-playing";
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
  showClockSeconds,
  showLyrics,
  emptyMessage,
}: {
  integrationId: string;
  entityId: string;
  showClockSeconds: boolean;
  showLyrics: boolean;
  emptyMessage: string;
}) => {
  const { entity, isLoading } = useNowPlaying({ integrationId, entityId });

  if (isLoading) return <AnalogClock showSeconds={showClockSeconds} />;

  const state = getMusicPaneState({
    integrationId,
    entityId,
    entity: entity ?? null,
    hasArtwork: Boolean(entity?.attributes.pictureUrl),
  });

  if (state !== "ready" || !entity) return <MusicPaneMessage message={emptyMessage} />;
  return <NowPlaying entity={entity} showLyrics={showLyrics} />;
};

export const MusicPane = ({
  integrationId,
  entityId,
  showClockSeconds,
  showLyrics,
}: {
  integrationId: string | null;
  entityId: string | null;
  showClockSeconds: boolean;
  showLyrics: boolean;
}) => {
  const t = useI18n("board");

  if (!integrationId || !entityId) {
    return <MusicPaneMessage message={t("idleScreen.music.notConfigured")} />;
  }

  return (
    <ConfiguredMusicPane
      integrationId={integrationId}
      entityId={entityId}
      showClockSeconds={showClockSeconds}
      showLyrics={showLyrics}
      emptyMessage={t("idleScreen.music.nothingPlaying")}
    />
  );
};
