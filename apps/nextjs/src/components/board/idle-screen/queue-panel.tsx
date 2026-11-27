"use client";

import { Text } from "@mantine/core";

import { useI18n } from "@homarr/translation/client";

import classes from "./idle-screen.module.css";
import type { QueueView } from "./use-music-assistant-queue";

/**
 * Read-only view of the configured Music Assistant queue. The current track
 * comes from Music Assistant's own index; no titles are matched against HA.
 * Marked interactive so scrolling the list does not close or swipe the AOD.
 */
export const QueuePanel = ({ queue }: { queue: QueueView | undefined }) => {
  const t = useI18n("board");

  return (
    <section className={classes.queuePanel} aria-label={t("idleScreen.queueLabel")} data-idle-interactive>
      {queue?.tracks.length ? (
        <ol className={classes.queueList}>
          {queue.tracks.map((track, index) => {
            const isCurrent = index === queue.currentIndex;
            return (
              <li
                key={`${index}-${track.title}`}
                className={classes.queueTrack}
                data-current={isCurrent}
                aria-current={isCurrent ? "true" : undefined}
              >
                <Text fw={600} c="white" truncate>
                  {track.title}
                </Text>
                {track.artist && (
                  <Text size="sm" c="gray.3" truncate>
                    {track.artist}
                  </Text>
                )}
                {track.album && (
                  <Text size="xs" c="gray.5" truncate>
                    {track.album}
                  </Text>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <Text className={classes.queueEmpty} c="gray.4" ta="center">
          {t("idleScreen.queueEmpty")}
        </Text>
      )}
    </section>
  );
};
