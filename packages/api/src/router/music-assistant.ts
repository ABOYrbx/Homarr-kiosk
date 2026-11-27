import { z } from "zod/v4";

import {
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

const access = createOneIntegrationMiddleware("query", "musicAssistant");

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
});
