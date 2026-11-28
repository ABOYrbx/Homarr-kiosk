"use client";

import { useMemo } from "react";

import type { SmartHomeEntitySelection } from "@homarr/integrations/types";
import { useSmartHomeSnapshot } from "@homarr/widgets/smart-home/use-smart-home";

import type { PlayerId } from "./music-selection";
import { filterMusicTracks, parsePlayerId, pickPlayingTrack } from "./music-selection";
import { fromSmartHomeEntity } from "./music-track";
import type { MusicTrack } from "./music-track";
import { useMusicAssistantNowPlaying } from "./use-music-assistant-now-playing";

/** The board fields that decide which music source the AOD uses. */
export interface MusicSourceSettings {
  idleScreenHomeAssistantIntegrationId: string | null;
  idleScreenMediaPlayerEntityId: string | null;
  idleScreenMusicAssistantIntegrationId: string | null;
  idleScreenMusicAssistantQueueId: string | null;
  idleScreenMusicSources: ("homeAssistant" | "musicAssistant")[];
  idleScreenMusicSelectionMode: "fixed" | "auto";
  idleScreenMusicPlayerFilterMode: "include" | "exclude";
  idleScreenMusicPlayerIds: string[];
}

/**
 * Pure selection step shared by the overlay presence watcher and the music
 * pane. Both modes keep their old preference: fixed stays HA-first with an MA
 * fallback, auto picks the newest playing candidate after applying the filter.
 */
export const selectMusicSourceTrack = ({
  settings,
  haTracks,
  maTracks,
}: {
  settings: MusicSourceSettings;
  haTracks: MusicTrack[];
  maTracks: MusicTrack[];
}): MusicTrack | undefined => {
  const haEnabled = settings.idleScreenMusicSources.includes("homeAssistant");
  const maEnabled = settings.idleScreenMusicSources.includes("musicAssistant");

  if (settings.idleScreenMusicSelectionMode === "fixed") {
    const haTrack = haEnabled
      ? haTracks.find(
          (candidate) =>
            candidate.integrationId === settings.idleScreenHomeAssistantIntegrationId &&
            candidate.playerId === settings.idleScreenMediaPlayerEntityId,
        )
      : undefined;
    if (haTrack) return haTrack;

    if (!maEnabled) return undefined;
    return maTracks.find(
      (candidate) =>
        candidate.integrationId === settings.idleScreenMusicAssistantIntegrationId &&
        candidate.playerId === settings.idleScreenMusicAssistantQueueId,
    );
  }

  const candidates = filterMusicTracks(
    [...(haEnabled ? haTracks : []), ...(maEnabled ? maTracks : [])],
    settings.idleScreenMusicPlayerFilterMode,
    settings.idleScreenMusicPlayerIds,
  );
  return pickPlayingTrack(candidates);
};

/**
 * Gathers the allowed HA media players and MA queues while the overlay is
 * mounted. Its callers are only rendered while the overlay is open, and each
 * underlying query/subscription is additionally gated by its source setting.
 */
export const useMusicSource = (
  settings: MusicSourceSettings,
): { track: MusicTrack | undefined; isLoading: boolean } => {
  const haIntegrationId = settings.idleScreenHomeAssistantIntegrationId;
  const maIntegrationId = settings.idleScreenMusicAssistantIntegrationId;
  const auto = settings.idleScreenMusicSelectionMode === "auto";
  const include = settings.idleScreenMusicPlayerFilterMode === "include";

  const haPlayerIds = useMemo(
    () =>
      settings.idleScreenMusicPlayerIds
        .map(parsePlayerId)
        .filter((parsed): parsed is PlayerId => parsed?.source === "ha" && parsed.integrationId === haIntegrationId)
        .map((parsed) => parsed.playerId),
    [settings.idleScreenMusicPlayerIds, haIntegrationId],
  );

  const haActive = settings.idleScreenMusicSources.includes("homeAssistant") && Boolean(haIntegrationId);
  // exclude with an empty list means all players; include with an empty list means none.
  const haEnabled =
    haActive &&
    (auto
      ? settings.idleScreenMusicPlayerFilterMode === "exclude" || haPlayerIds.length > 0
      : Boolean(settings.idleScreenMediaPlayerEntityId));

  const haSelection = useMemo<Required<SmartHomeEntitySelection>>(
    () => ({
      entityIds: auto
        ? include
          ? haPlayerIds
          : []
        : settings.idleScreenMediaPlayerEntityId
          ? [settings.idleScreenMediaPlayerEntityId]
          : [],
      areaIds: [],
      domains: auto ? ["media_player"] : [],
      excludedEntityIds: auto && !include ? haPlayerIds : [],
    }),
    [auto, include, haPlayerIds, settings.idleScreenMediaPlayerEntityId],
  );

  const snapshot = useSmartHomeSnapshot(haIntegrationId ?? "", haSelection, { live: true, enabled: haEnabled });
  const haTracks = useMemo(
    () => (snapshot.data?.entities ?? []).flatMap((entity) => fromSmartHomeEntity(entity, haIntegrationId ?? "") ?? []),
    [snapshot.data, haIntegrationId],
  );

  const maEnabled =
    settings.idleScreenMusicSources.includes("musicAssistant") &&
    Boolean(maIntegrationId) &&
    (auto || Boolean(settings.idleScreenMusicAssistantQueueId));
  const { tracks: maTracks, isLoading: maLoading } = useMusicAssistantNowPlaying({
    integrationId: maIntegrationId,
    queueId: auto ? null : settings.idleScreenMusicAssistantQueueId,
    enabled: maEnabled,
  });

  const track = useMemo(() => selectMusicSourceTrack({ settings, haTracks, maTracks }), [settings, haTracks, maTracks]);

  return {
    track,
    isLoading: (haEnabled && snapshot.isLoading) || (maEnabled && maLoading),
  };
};
