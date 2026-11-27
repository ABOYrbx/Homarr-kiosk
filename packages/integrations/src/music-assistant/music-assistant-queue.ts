import { isRecord } from "@homarr/common";
import z from "zod";

export type QueueInfo = { id: string; name: string };
export type QueueTrack = {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
};
export type QueueView = { tracks: QueueTrack[]; currentIndex?: number };

const itemMappingSchema = z
  .object({
    name: z.string().nullish(),
  })
  .passthrough();

const mediaItemSchema = z
  .object({
    name: z.string().nullish(),
    artists: z.array(itemMappingSchema).nullish(),
    album: itemMappingSchema.nullish(),
    duration: z.number().nullish(),
  })
  .passthrough();

// MA sends a QueueItem (its own `name` is an "Artist - Title" label) and, for
// tracks, a resolved `media_item` with the authoritative title and metadata.
const queueItemSchema = z
  .object({
    name: z.string().nullish(),
    duration: z.number().nullish(),
    media_item: mediaItemSchema.nullish(),
  })
  .passthrough();

// `player_queues/all` and `player_queues/get` both return PlayerQueue objects.
// Current MA servers send `items` as a count; `player_queues/items` carries the
// tracks. Older/fake servers may embed the tracks directly, so accept both.
const playerQueueSchema = z
  .object({
    queue_id: z.string().min(1),
    display_name: z.string().nullish(),
    name: z.string().nullish(),
    current_index: z.number().int().nullish(),
    items: z.union([z.array(queueItemSchema), z.number(), z.null()]).nullish(),
  })
  .passthrough();

const parseResult = (envelope: unknown): unknown => {
  if (isRecord(envelope)) {
    if ("error_code" in envelope) {
      throw new Error(`Music Assistant command failed (code ${String(envelope.error_code)})`);
    }
    if ("result" in envelope) return envelope.result;
  }
  return envelope;
};

const toTrack = (item: z.infer<typeof queueItemSchema>): QueueTrack | undefined => {
  const title = item.media_item?.name ?? item.name;
  if (!title) return undefined;

  const track: QueueTrack = { title };
  const artist = item.media_item?.artists
    ?.map((entry) => entry.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
  if (artist) track.artist = artist;
  const album = item.media_item?.album?.name;
  if (album) track.album = album;
  const duration = item.media_item?.duration ?? item.duration;
  if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) {
    track.durationSeconds = Math.round(duration);
  }
  return track;
};

/** Normalise a `player_queues/all` result into the board settings queue list. */
export const normalizeQueues = (envelope: unknown): QueueInfo[] => {
  const result = parseResult(envelope);
  const parsed = z.array(playerQueueSchema).safeParse(result);
  if (!parsed.success) throw new Error("Music Assistant returned an invalid queue list");
  return parsed.data.map((queue) => ({
    id: queue.queue_id,
    name: queue.display_name ?? queue.name ?? queue.queue_id,
  }));
};

/**
 * Normalise a `player_queues/get` result, optionally with the result of a
 * `player_queues/items` command. Only whitelisted track fields are returned.
 */
export const normalizeQueue = (envelope: unknown, itemsEnvelope?: unknown): QueueView => {
  const result = parseResult(envelope);
  if (result === null || result === undefined) return { tracks: [], currentIndex: undefined };

  const parsed = playerQueueSchema.safeParse(result);
  if (!parsed.success) throw new Error("Music Assistant returned an invalid queue");
  const queue = parsed.data;

  const rawItems = Array.isArray(queue.items)
    ? queue.items
    : itemsEnvelope === undefined
      ? []
      : parseResult(itemsEnvelope);
  const items = z.array(queueItemSchema).safeParse(rawItems);
  if (!items.success) throw new Error("Music Assistant returned invalid queue items");

  return {
    tracks: items.data.map(toTrack).filter((track): track is QueueTrack => track !== undefined),
    currentIndex: typeof queue.current_index === "number" ? queue.current_index : undefined,
  };
};
