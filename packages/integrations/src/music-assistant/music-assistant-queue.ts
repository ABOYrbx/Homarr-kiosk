import { isRecord } from "@homarr/common";
import z from "zod";

export type QueueTrack = {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
};
export type NowPlayingTrack = QueueTrack & { artworkUrl?: string };
export type QueueInfo = {
  id: string;
  name: string;
  state?: "playing" | "paused" | "idle";
  active?: boolean;
  elapsedTime?: number;
  elapsedTimeLastUpdated?: number;
  currentIndex?: number;
  currentItem?: NowPlayingTrack;
};
export type MusicAssistantNowPlaying = {
  queueId: string;
  name: string;
  state: "playing" | "paused" | "idle";
  elapsedTime?: number;
  elapsedTimeLastUpdated?: number;
  currentIndex?: number;
  track?: NowPlayingTrack;
};
export type QueueView = { tracks: QueueTrack[]; currentIndex?: number };

const itemMappingSchema = z
  .object({
    name: z.string().nullish(),
  })
  .passthrough();

const imageSchema = z
  .object({
    path: z.string().nullish(),
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
    image: imageSchema.nullish(),
  })
  .passthrough();

// `player_queues/all` and `player_queues/get` both return PlayerQueue objects.
// Current MA servers send `items` as a count; `player_queues/items` carries the
// tracks. Older/fake servers may embed the tracks directly, so accept both.
// Playback fields are optional and tolerant: servers and versions disagree on
// which ones they send, and MA uses states such as "stopped" that we fold to idle.
const playerQueueSchema = z
  .object({
    queue_id: z.string().min(1),
    display_name: z.string().nullish(),
    name: z.string().nullish(),
    state: z.string().nullish(),
    active: z.boolean().nullish(),
    elapsed_time: z.number().nullish(),
    elapsed_time_last_updated: z.number().nullish(),
    current_index: z.number().int().nullish(),
    current_item: queueItemSchema.nullish(),
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

const toQueueState = (value: string | null | undefined): "playing" | "paused" | "idle" =>
  value === "playing" || value === "paused" ? value : "idle";

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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
  if (isFiniteNumber(duration) && duration >= 0) {
    track.durationSeconds = Math.round(duration);
  }
  return track;
};

// Only accept absolute http(s) paths as artwork: MA also returns proxy routes
// and local file paths that a browser outside the MA host cannot resolve.
const toNowPlayingTrack = (item: z.infer<typeof queueItemSchema>): NowPlayingTrack | undefined => {
  const track = toTrack(item);
  if (!track) return undefined;
  const path = item.image?.path;
  if (path && /^https?:\/\//.test(path)) return { ...track, artworkUrl: path };
  return track;
};

/** Normalise a `player_queues/all` result into the board settings queue list. */
export const normalizeQueues = (envelope: unknown): QueueInfo[] => {
  const result = parseResult(envelope);
  const parsed = z.array(playerQueueSchema).safeParse(result);
  if (!parsed.success) throw new Error("Music Assistant returned an invalid queue list");
  return parsed.data.map((queue) => {
    const info: QueueInfo = {
      id: queue.queue_id,
      name: queue.display_name ?? queue.name ?? queue.queue_id,
    };
    if (typeof queue.state === "string") info.state = toQueueState(queue.state);
    if (typeof queue.active === "boolean") info.active = queue.active;
    if (isFiniteNumber(queue.elapsed_time)) info.elapsedTime = queue.elapsed_time;
    if (isFiniteNumber(queue.elapsed_time_last_updated)) info.elapsedTimeLastUpdated = queue.elapsed_time_last_updated;
    if (typeof queue.current_index === "number") info.currentIndex = queue.current_index;
    const currentItem = queue.current_item ? toNowPlayingTrack(queue.current_item) : undefined;
    if (currentItem) info.currentItem = currentItem;
    return info;
  });
};

/**
 * Normalise the `player_queues/all` result for one queue into a now-playing
 * record. Elapsed time and its update timestamp stay in the seconds unit MA
 * reports them in.
 */
export const normalizeNowPlaying = (envelope: unknown, queueId: string): MusicAssistantNowPlaying => {
  const result = parseResult(envelope);
  const parsed = z.array(playerQueueSchema).safeParse(result);
  if (!parsed.success) throw new Error("Music Assistant returned an invalid queue list");
  const queue = parsed.data.find((entry) => entry.queue_id === queueId);
  if (!queue) throw new Error(`Music Assistant queue ${queueId} was not found`);

  const nowPlaying: MusicAssistantNowPlaying = {
    queueId: queue.queue_id,
    name: queue.display_name ?? queue.name ?? queue.queue_id,
    state: toQueueState(queue.state),
  };
  if (isFiniteNumber(queue.elapsed_time)) nowPlaying.elapsedTime = queue.elapsed_time;
  if (isFiniteNumber(queue.elapsed_time_last_updated))
    nowPlaying.elapsedTimeLastUpdated = queue.elapsed_time_last_updated;
  if (typeof queue.current_index === "number") nowPlaying.currentIndex = queue.current_index;
  const track = queue.current_item ? toNowPlayingTrack(queue.current_item) : undefined;
  if (track) nowPlaying.track = track;
  return nowPlaying;
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
