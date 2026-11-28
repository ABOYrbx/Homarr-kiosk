"use client";

import { useMemo } from "react";

import { clientApi } from "@homarr/api/client";

import { fromMusicAssistantNowPlaying } from "./music-track";
import type { MusicTrack } from "./music-track";

const STALE_TIME_MS = 5 * 1000;

/**
 * Subscribes to every Music Assistant queue while the idle overlay is open.
 * The tRPC procedure only takes the integration id (its middleware needs it),
 * so the optional queue id is applied to the normalized tracks here. Pass no
 * queue id to discover all players, e.g. for automatic source selection.
 */
export const useMusicAssistantNowPlaying = ({
  integrationId,
  queueId,
  enabled,
}: {
  integrationId: string | null;
  queueId: string | null;
  enabled: boolean;
}): { tracks: MusicTrack[]; isLoading: boolean } => {
  const query = clientApi.musicAssistant.nowPlaying.useQuery(
    { integrationId: integrationId ?? "" },
    {
      enabled: enabled && Boolean(integrationId),
      staleTime: STALE_TIME_MS,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const tracks = useMemo(() => {
    const normalized = (query.data ?? [])
      .map((record) => fromMusicAssistantNowPlaying(record, integrationId ?? ""))
      .filter((track): track is MusicTrack => track !== undefined);

    return queueId ? normalized.filter((track) => track.playerId === queueId) : normalized;
  }, [query.data, integrationId, queueId]);

  return { tracks, isLoading: query.isLoading };
};
