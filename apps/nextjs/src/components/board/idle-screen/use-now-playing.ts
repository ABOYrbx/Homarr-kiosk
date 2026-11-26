"use client";

import { useMemo } from "react";

import type { SmartHomeEntity } from "@homarr/integrations/types";
import { useSmartHomeSnapshot } from "@homarr/widgets/smart-home/use-smart-home";

/**
 * Subscribes to the single configured HA media player. The hook is only
 * mounted while the idle overlay is open, so no background polling or
 * WebSocket subscription exists while the dashboard is in normal use.
 */
export const useNowPlaying = ({
  integrationId,
  entityId,
}: {
  integrationId: string;
  entityId: string;
}): { entity: SmartHomeEntity | undefined; isLoading: boolean } => {
  const selection = useMemo(
    () => ({ entityIds: [entityId], areaIds: [], domains: [], excludedEntityIds: [] }),
    [entityId],
  );
  const query = useSmartHomeSnapshot(integrationId, selection, { live: true });
  const entity = useMemo(
    () => query.data?.entities.find((candidate) => candidate.id === entityId),
    [query.data, entityId],
  );

  return { entity, isLoading: query.isLoading };
};
