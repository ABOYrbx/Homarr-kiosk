"use client";

import { useEffect, useState } from "react";

import { useCurrentIntlLocale } from "@homarr/translation/client";

import { getClockAngles } from "./angles";
import classes from "./idle-screen.module.css";

const useClockTime = (showSeconds: boolean): Date | null => {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const step = showSeconds ? 1_000 : 60_000;
    const tick = () => setTime(new Date());
    const clear = () => {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
    };
    // Chained one-shot timers aligned to the minute/second boundary: no
    // permanent interval, no drift, and no work while the tab is hidden.
    const schedule = () => {
      clear();
      if (document.hidden) return;
      timeout = setTimeout(
        () => {
          tick();
          schedule();
        },
        step - (Date.now() % step),
      );
    };
    const onVisibilityChange = () => {
      if (document.hidden) clear();
      else {
        tick();
        schedule();
      }
    };

    tick();
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [showSeconds]);

  return time;
};

const marks = Array.from({ length: 12 }, (_, index) => index);

export const AnalogClock = ({ showSeconds }: { showSeconds: boolean }) => {
  const time = useClockTime(showSeconds);
  const locale = useCurrentIntlLocale();
  const angles = getClockAngles(time ?? new Date(0), showSeconds);
  const date = time
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(time)
    : "";

  return (
    <div className={classes.clockRoot}>
      <svg
        className={classes.clockFace}
        viewBox="0 0 400 400"
        role="img"
        aria-label={time ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "numeric" }).format(time) : ""}
      >
        <circle cx="200" cy="200" r="186" className={classes.clockRing} />
        {marks.map((mark) => (
          <line
            key={mark}
            x1="200"
            y1={mark % 3 === 0 ? 28 : 34}
            x2="200"
            y2="48"
            className={mark % 3 === 0 ? classes.clockMarkMajor : classes.clockMark}
            transform={`rotate(${mark * 30} 200 200)`}
          />
        ))}
        <g transform={`rotate(${angles.hour} 200 200)`}>
          <line x1="200" y1="214" x2="200" y2="112" className={classes.clockHourHand} />
        </g>
        <g transform={`rotate(${angles.minute} 200 200)`}>
          <line x1="200" y1="216" x2="200" y2="66" className={classes.clockMinuteHand} />
        </g>
        {showSeconds && (
          <g transform={`rotate(${angles.second} 200 200)`}>
            <line x1="200" y1="222" x2="200" y2="52" className={classes.clockSecondHand} />
          </g>
        )}
        <circle cx="200" cy="200" r="7" className={classes.clockCenter} />
      </svg>
      <div className={classes.clockDate}>{date}</div>
    </div>
  );
};
