import type { IntegrationInstanceOfKind } from "@homarr/integrations/factory";
import { createIntegrationAsync } from "@homarr/integrations/factory";

import { createIntegrationRequestHandler } from "./lib/integration-request-handler";

type MusicAssistantIntegration = IntegrationInstanceOfKind<"musicAssistant">;
type QueueInfo = Awaited<ReturnType<MusicAssistantIntegration["getQueuesAsync"]>>[number];
type QueueView = Awaited<ReturnType<MusicAssistantIntegration["getQueueAsync"]>>;
type MusicAssistantNowPlaying = Awaited<ReturnType<MusicAssistantIntegration["getNowPlayingAsync"]>>[number];

export const musicAssistantQueuesRequestHandler = createIntegrationRequestHandler<
  QueueInfo[],
  "musicAssistant",
  Record<string, never>
>({
  cacheNamespace: "music-assistant:queues",
  cacheVersion: "v1",
  cacheTtlMs: 10_000,
  fallbackToStaleOnError: true,
  async requestAsync(integration) {
    const instance = await createIntegrationAsync(integration);
    return await instance.getQueuesAsync();
  },
});

export const musicAssistantQueueRequestHandler = createIntegrationRequestHandler<
  QueueView,
  "musicAssistant",
  { queueId: string }
>({
  cacheNamespace: "music-assistant:queue",
  cacheVersion: "v1",
  cacheTtlMs: 10_000,
  fallbackToStaleOnError: true,
  async requestAsync(integration, input) {
    const instance = await createIntegrationAsync(integration);
    return await instance.getQueueAsync(input.queueId);
  },
});

export const musicAssistantNowPlayingRequestHandler = createIntegrationRequestHandler<
  MusicAssistantNowPlaying[],
  "musicAssistant",
  Record<string, never>
>({
  cacheNamespace: "music-assistant:now-playing",
  cacheVersion: "v1",
  cacheTtlMs: 5_000,
  fallbackToStaleOnError: true,
  async requestAsync(integration) {
    const instance = await createIntegrationAsync(integration);
    return await instance.getNowPlayingAsync();
  },
});
