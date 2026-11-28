import { z } from "zod/v4";

import { createIntegrationAsync } from "@homarr/integrations/factory";
import {
  musicAssistantNowPlayingRequestHandler,
  musicAssistantQueueRequestHandler,
  musicAssistantQueuesRequestHandler,
} from "@homarr/request-handler/music-assistant";

import { createOneIntegrationMiddleware } from "../middlewares/integration";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const queueInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const queueTrackSchema = z.object({
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

const queueViewSchema = z.object({
  tracks: z.array(queueTrackSchema),
  currentIndex: z.number().optional(),
});

const nowPlayingTrackSchema = queueTrackSchema.extend({
  artworkUrl: z.string().optional(),
});

const nowPlayingSchema = z.object({
  queueId: z.string(),
  name: z.string(),
  state: z.enum(["playing", "paused", "idle"]),
  // MA reports elapsed time and its update timestamp in seconds; the client
  // adapter is responsible for converting them to milliseconds.
  elapsedTime: z.number().optional(),
  elapsedTimeLastUpdated: z.number().optional(),
  currentIndex: z.number().optional(),
  track: nowPlayingTrackSchema.optional(),
});

const access = createOneIntegrationMiddleware("query", "musicAssistant");
const interact = createOneIntegrationMiddleware("interact", "musicAssistant");

export const musicAssistantRouter = createTRPCRouter({
  queues: protectedProcedure
    .concat(access)
    .output(z.object({ queues: z.array(queueInfoSchema) }))
    .query(async ({ ctx }) => {
      const handler = musicAssistantQueuesRequestHandler.handler(ctx.integration, {});
      const { data } = await handler.getDataAsync();
      return { queues: data };
    }),
  queue: protectedProcedure
    .concat(access)
    .input(z.object({ queueId: z.string().min(1) }))
    .output(queueViewSchema)
    .query(async ({ ctx, input }) => {
      const handler = musicAssistantQueueRequestHandler.handler(ctx.integration, { queueId: input.queueId });
      const { data } = await handler.getDataAsync();
      return data;
    }),
  nowPlaying: protectedProcedure
    .concat(access)
    .input(z.object({ integrationId: z.string() }))
    .output(z.array(nowPlayingSchema))
    .query(async ({ ctx }) => {
      const handler = musicAssistantNowPlayingRequestHandler.handler(ctx.integration, {});
      const { data } = await handler.getDataAsync();
      return data;
    }),
  control: protectedProcedure
    .concat(interact)
    .input(
      z.object({
        integrationId: z.string(),
        queueId: z.string(),
        action: z.enum(["play_pause", "next", "previous", "seek"]),
        positionSeconds: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await createIntegrationAsync(ctx.integration);
      await instance.controlAsync(input.queueId, input.action, input.positionSeconds);
      await musicAssistantNowPlayingRequestHandler.invalidateCacheAsync([ctx.integration.id]);
    }),
});
