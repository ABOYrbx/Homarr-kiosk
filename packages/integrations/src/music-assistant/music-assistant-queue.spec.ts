import { describe, expect, it } from "vitest";

import { normalizeQueue, normalizeQueues } from "./music-assistant-queue";

const envelope = (result: unknown) => ({ message_id: "7", result });

const queueItem = (title: string) => ({
  queue_id: "queue-1",
  queue_item_id: `item-${title}`,
  name: `${title} (queue item label)`,
  duration: 210,
  media_item: {
    media_type: "track",
    name: title,
    artists: [{ name: "Same Artist" }],
    album: { name: "Same Album" },
    duration: 210,
  },
});

describe("normalizeQueue", () => {
  it("keeps Music Assistant's current index when two tracks share a title", () => {
    const view = normalizeQueue(
      envelope({
        queue_id: "queue-1",
        display_name: "Living room",
        current_index: 1,
        items: [queueItem("Identical title"), queueItem("Identical title")],
      }),
    );

    expect(view.currentIndex).toBe(1);
    expect(view.tracks).toHaveLength(2);
    expect(view.tracks[0]?.title).toBe("Identical title");
    expect(view.tracks[0]?.artist).toBe("Same Artist");
    expect(view.tracks[0]?.durationSeconds).toBe(210);
  });

  it("normalises absent queue data to an empty view", () => {
    expect(normalizeQueue(envelope(null))).toEqual({ tracks: [], currentIndex: undefined });
  });

  it("rejects an envelope carrying an error_code", () => {
    expect(() => normalizeQueue({ message_id: "7", error_code: 20, details: "Queue not found" })).toThrow(
      /Music Assistant/,
    );
  });

  it("contains no token, apiKey or raw envelope fields", () => {
    const view = normalizeQueue(
      envelope({
        queue_id: "queue-1",
        display_name: "Living room",
        token: "secret",
        apiKey: "secret",
        current_index: 0,
        items: [{ ...queueItem("Track"), token: "secret", apiKey: "secret", streamdetails: { token: "secret" } }],
      }),
    );

    const forbiddenKeys = new Set([
      "token",
      "apiKey",
      "message_id",
      "result",
      "error_code",
      "details",
      "queue_id",
      "display_name",
      "current_index",
      "items",
      "queue_item_id",
      "media_item",
      "streamdetails",
    ]);
    const keys: string[] = [];
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      for (const [key, nested] of Object.entries(value)) {
        keys.push(key);
        collectKeys(nested);
      }
    };
    collectKeys(view);

    expect(keys.filter((key) => forbiddenKeys.has(key))).toEqual([]);
    expect(Object.keys(view).toSorted()).toEqual(["currentIndex", "tracks"]);
    expect(Object.keys(view.tracks[0] ?? {}).toSorted()).toEqual(["album", "artist", "durationSeconds", "title"]);
  });

  it("uses player_queues/items when the queue only carries an item count", () => {
    const view = normalizeQueue(
      envelope({ queue_id: "queue-1", display_name: "Living room", current_index: 0, items: 2 }),
      envelope([queueItem("First"), queueItem("Second")]),
    );

    expect(view.currentIndex).toBe(0);
    expect(view.tracks.map((track) => track.title)).toEqual(["First", "Second"]);
  });
});

describe("normalizeQueues", () => {
  it("maps player_queues/all entries to id and name only", () => {
    expect(
      normalizeQueues(
        envelope([
          { queue_id: "queue-1", display_name: "Kitchen", items: 0 },
          { queue_id: "queue-2", name: "Studio", items: 3 },
        ]),
      ),
    ).toEqual([
      { id: "queue-1", name: "Kitchen" },
      { id: "queue-2", name: "Studio" },
    ]);
  });
});
