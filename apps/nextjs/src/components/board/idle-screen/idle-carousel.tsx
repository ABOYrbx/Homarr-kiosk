"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import classes from "./idle-screen.module.css";
import { isIdleBackgroundTarget, isIdleOverlayInteractiveTarget } from "./carousel-gesture";
import { classifyIdlePointer, getIdleLayerTarget, idleLayerOrder, isIdleNavigationEvent } from "./carousel";
import type { IdleLayer } from "./carousel";

const DOTS_VISIBLE_MS = 3_000;

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
  const previousPreferredLayer = useRef<IdleLayer>(initialLayer);
  const [showDots, setShowDots] = useState(true);
  const dotsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealDots = useCallback(() => {
    setShowDots(true);
    if (dotsTimer.current) clearTimeout(dotsTimer.current);
    dotsTimer.current = setTimeout(() => setShowDots(false), DOTS_VISIBLE_MS);
  }, []);

  useEffect(() => {
    revealDots();
    return () => {
      if (dotsTimer.current) clearTimeout(dotsTimer.current);
    };
  }, [revealDots]);

  // Playback starting or stopping changes the preferred layer. Follow every
  // transition so the view always matches the player; manual navigation holds
  // only until the next playback change.
  useEffect(() => {
    const previous = previousPreferredLayer.current;
    previousPreferredLayer.current = initialLayer;
    if (previous !== initialLayer) {
      setActiveLayer(initialLayer);
      revealDots();
    }
  }, [initialLayer, revealDots]);

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
      revealDots();
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveLayer((current) => getIdleLayerTarget(current, -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveLayer((current) => getIdleLayerTarget(current, 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, revealDots]);

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
    revealDots();
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
      <div className={classes.carouselDots} data-visible={showDots} aria-hidden="true">
        {idleLayerOrder.map((layer) => (
          <span key={layer} className={classes.carouselDot} data-active={layer === activeLayer} />
        ))}
      </div>
    </div>
  );
};
