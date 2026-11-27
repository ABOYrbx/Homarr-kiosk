import { z } from "zod/v4";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { resolveLyrics } from "./lyrics/router-resolve";
import { lyricsResultSchema } from "./lyrics/types";

const inputSchema = z.object({
  title: z.string().min(1).max(300),
  artist: z.string().max(300).optional(),
  album: z.string().max(300).optional(),
  durationSeconds: z.number().int().min(1).max(3600).optional(),
});

export const lyricsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(inputSchema)
    .output(lyricsResultSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/api/lyrics",
        tags: ["lyrics"],
        protect: true,
        summary: "Get synchronized lyrics",
        description:
          "Find synchronized lyrics for a track via LRCLIB. No API key is required; an authenticated user is still needed.",
      },
    })
    .query(async ({ input }) => resolveLyrics(input)),
});
