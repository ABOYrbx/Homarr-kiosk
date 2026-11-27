"use client";

import { clientApi } from "@homarr/api/client";

const STALE_TIME_MS = 60 * 60 * 1000;
const GC_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * Requests lyrics only while the idle overlay shows a track and lyrics are
 * enabled. A new track produces a new query key and therefore a new request;
 * old results are never reused for a different track.
 */
export const useLyrics = ({
  enabled,
  title,
  artist,
  album,
  durationSeconds,
}: {
  enabled: boolean;
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
}) =>
  clientApi.lyrics.get.useQuery(
    {
      title,
      artist,
      album,
      durationSeconds,
    },
    {
      enabled: enabled && title.length > 0,
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
