"use client";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";

export type QueueView = RouterOutputs["musicAssistant"]["queue"];

const STALE_TIME_MS = 10 * 1000;

/**
 * Requests the selected Music Assistant queue only while the idle overlay
 * shows the music layer and both settings are configured. The queue changes
 * often, so stale results are short-lived; failures do not retry on a kiosk.
 */
export const useMusicAssistantQueue = ({
  integrationId,
  queueId,
  enabled,
}: {
  integrationId: string | null;
  queueId: string | null;
  enabled: boolean;
}): { queue: QueueView | undefined; isLoading: boolean } => {
  const query = clientApi.musicAssistant.queue.useQuery(
    { integrationId: integrationId ?? "", queueId: queueId ?? "" },
    {
      enabled: enabled && Boolean(integrationId) && Boolean(queueId),
      staleTime: STALE_TIME_MS,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  return { queue: query.data, isLoading: query.isLoading };
};
