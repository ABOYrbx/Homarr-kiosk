"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import classes from "./idle-screen.module.css";
import { isIdleBackgroundTarget, isIdleOverlayInteractiveTarget } from "./carousel-gesture";
import { classifyIdlePointer, getIdleLayerTarget, isIdleNavigationEvent } from "./carousel";
import type { IdleLayer } from "./carousel";

interface PointerStart {
  pointerId: number;
  target: EventTarget | null;
  x: number;
  y: number;
}

export const IdleCarousel = ({
  initialLayer,
  musicPane,
  clockPane,
  widgetsPane,
  onClose,
}: {
  initialLayer: IdleLayer;
  musicPane: ReactNode;
  clockPane: ReactNode;
  widgetsPane: ReactNode;
  onClose: () => void;
}) => {
  const [activeLayer, setActiveLayer] = useState<IdleLayer>(initialLayer);
  const pointerStart = useRef<PointerStart | null>(null);
  const manuallyNavigated = useRef(false);

  // Playback starting or stopping changes the preferred layer. Only follow it
  // until the user has navigated themselves.
  useEffect(() => {
    if (manuallyNavigated.current) return;
    setActiveLayer(initialLayer);
  }, [initialLayer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.defaultPrevented || isIdleOverlayInteractiveTarget(event.target) || !isIdleNavigationEvent(event)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        manuallyNavigated.current = true;
        setActiveLayer((current) => getIdleLayerTarget(current, -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        manuallyNavigated.current = true;
        setActiveLayer((current) => getIdleLayerTarget(current, 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      pointerStart.current = null;
      return;
    }
    pointerStart.current = {
      pointerId: event.pointerId,
      target: event.target,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    if (!isIdleBackgroundTarget(start.target)) return;

    const direction = classifyIdlePointer(event.clientX - start.x, event.clientY - start.y);
    if (direction === null) {
      onClose();
      return;
    }
    manuallyNavigated.current = true;
    setActiveLayer((current) => getIdleLayerTarget(current, direction));
  };

  const panes: Record<IdleLayer, ReactNode> = {
    music: musicPane,
    clock: clockPane,
    widgets: widgetsPane,
  };

  return (
    <div
      className={classes.carousel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => {
        if (pointerStart.current?.pointerId === event.pointerId) pointerStart.current = null;
      }}
    >
      <div key={activeLayer} className={classes.layer} data-idle-layer={activeLayer}>
        {panes[activeLayer]}
      </div>
    </div>
  );
};
