"use client";

import { useEffect } from "react";
import { Portal } from "@mantine/core";
import { usePathname } from "next/navigation";

import { useOptionalBoard } from "@homarr/boards/context";
import { useOptionalEditMode } from "@homarr/boards/edit-mode";
import { useI18n } from "@homarr/translation/client";

import { AnalogClock } from "./analog-clock";
import classes from "./idle-screen.module.css";
import { IdleWidgets } from "./idle-widgets";
import { resolveIdleItems } from "./idle-widgets-layout";
import { NowPlaying } from "./now-playing";
import type { IdleScreenMode } from "./playback";
import { decideIdleView } from "./playback";
import { useIdleScreen } from "./use-idle-screen";
import { useNowPlaying } from "./use-now-playing";

export interface IdleScreenSettings {
  idleScreenEnabled: boolean;
  idleScreenTimeoutMinutes: number;
  idleScreenMode: IdleScreenMode;
  idleScreenLayoutId: string | null;
  idleScreenHomeAssistantIntegrationId: string | null;
  idleScreenMediaPlayerEntityId: string | null;
  idleScreenShowClockSeconds: boolean;
  idleScreenShowLyrics: boolean;
}

type WakeLock = { release: () => Promise<void> };

const useWakeLock = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    let sentinel: WakeLock | undefined;
    const acquire = async () => {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (type: "screen") => Promise<WakeLock> };
          }
        ).wakeLock;
        if (wakeLock) sentinel = await wakeLock.request("screen");
      } catch {
        // A wake lock is only a hint; browsers and kiosk shells may deny it.
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
};

const MusicIdleScreen = ({
  integrationId,
  entityId,
  mode,
  showClockSeconds,
  showLyrics,
}: {
  integrationId: string;
  entityId: string;
  mode: IdleScreenMode;
  showClockSeconds: boolean;
  showLyrics: boolean;
}) => {
  const { entity, isLoading } = useNowPlaying({ integrationId, entityId });
  const attributes = entity?.attributes;
  const hasTrack = Boolean(attributes?.mediaTitle || entity?.state === "playing");
  const view = decideIdleView({ mode, hasTrack, isPlaying: entity?.state === "playing" });

  if (isLoading || !entity || view === "clock") return <AnalogClock showSeconds={showClockSeconds} />;
  return <NowPlaying entity={entity} showLyrics={showLyrics} />;
};

export const IdleScreen = ({ board, tourActive = false }: { board: IdleScreenSettings; tourActive?: boolean }) => {
  const t = useI18n("board");
  const [isEditMode] = useOptionalEditMode() ?? [false];
  const pathname = usePathname();
  const onSettingsPage = pathname?.endsWith("/settings") ?? false;
  // Read the live board so saved setting changes take effect without a reload.
  const liveBoard = useOptionalBoard();
  const settings: IdleScreenSettings = liveBoard ?? board;
  const open = useIdleScreen({
    enabled: settings.idleScreenEnabled && !isEditMode && !tourActive && !onSettingsPage,
    timeoutMinutes: settings.idleScreenTimeoutMinutes,
  });
  useWakeLock(open);

  if (!open) return null;

  const integrationId = settings.idleScreenHomeAssistantIntegrationId;
  const entityId = settings.idleScreenMediaPlayerEntityId;
  const canShowMusic = settings.idleScreenMode !== "clock" && Boolean(integrationId && entityId);
  const idleLayoutId = settings.idleScreenLayoutId;
  const hasWidgetLayout = Boolean(
    liveBoard &&
    idleLayoutId &&
    liveBoard.layouts.some((layout) => layout.id === idleLayoutId) &&
    resolveIdleItems(liveBoard, idleLayoutId).length > 0,
  );
  // Playback state stays owned by MusicIdleScreen; only the widgets branch is
  // decided here, independently of whether a track is playing.
  const view = decideIdleView({
    mode: settings.idleScreenMode,
    hasTrack: false,
    isPlaying: false,
    hasWidgetLayout,
  });

  return (
    <Portal>
      <div className={classes.overlay} role="region" aria-label={t("idleScreen.title")} data-idle-screen="true">
        {view === "widgets" ? (
          <IdleWidgets layoutId={idleLayoutId ?? ""} />
        ) : canShowMusic ? (
          <MusicIdleScreen
            integrationId={integrationId as string}
            entityId={entityId as string}
            mode={settings.idleScreenMode}
            showClockSeconds={settings.idleScreenShowClockSeconds}
            showLyrics={settings.idleScreenShowLyrics}
          />
        ) : (
          <AnalogClock showSeconds={settings.idleScreenShowClockSeconds} />
        )}
      </div>
    </Portal>
  );
};
