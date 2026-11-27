"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Small idle timer with explicit visibility handling. The countdown starts
 * now (never immediately open), restarts on every input and is paused while
 * the tab is hidden.
 */
export const useIdleScreen = ({
  enabled,
  timeoutMinutes,
  paused = false,
  ignoreActivity,
}: {
  enabled: boolean;
  timeoutMinutes: number;
  paused?: boolean;
  ignoreActivity?: (event: { type: string; key?: string }) => boolean;
}): { open: boolean; dismiss: () => void } => {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const scheduleRef = useRef<(() => void) | null>(null);
  const updateOpen = useCallback((nextOpen: boolean) => {
    openRef.current = nextOpen;
    setOpen(nextOpen);
  }, []);

  useEffect(() => {
    if (!enabled || paused) {
      updateOpen(false);
      scheduleRef.current = null;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (document.hidden) return;
      const minutes = Number.isFinite(timeoutMinutes) ? Math.max(1, timeoutMinutes) : 5;
      timer = setTimeout(() => updateOpen(true), minutes * 60_000);
    };
    scheduleRef.current = schedule;
    const onActivity = (event: Event) => {
      const { key } = event as Event & { key?: string };
      if (openRef.current && ignoreActivity?.({ type: event.type, key })) return;
      updateOpen(false);
      schedule();
    };
    const onVisibilityChange = () => {
      updateOpen(false);
      schedule();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      clear();
      scheduleRef.current = null;
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, timeoutMinutes, paused, ignoreActivity, updateOpen]);

  const dismiss = useCallback(() => {
    updateOpen(false);
    scheduleRef.current?.();
  }, [updateOpen]);

  return { open, dismiss };
};
