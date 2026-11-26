"use client";

import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Small idle timer with explicit visibility handling. The countdown starts
 * now (never immediately open), restarts on every input and is paused while
 * the tab is hidden.
 */
export const useIdleScreen = ({ enabled, timeoutMinutes }: { enabled: boolean; timeoutMinutes: number }): boolean => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
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
      timer = setTimeout(() => setOpen(true), minutes * 60_000);
    };
    const onActivity = () => {
      setOpen(false);
      schedule();
    };
    const onVisibilityChange = () => {
      setOpen(false);
      schedule();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      clear();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, timeoutMinutes]);

  return open;
};
