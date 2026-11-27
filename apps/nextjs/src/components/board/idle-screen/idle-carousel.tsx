"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import classes from "./idle-screen.module.css";
import { classifyIdlePointer, getIdleLayerTarget } from "./carousel";
import type { IdleLayer } from "./carousel";

interface PointerStart {
  pointerId: number;
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveLayer((current) => getIdleLayerTarget(current, -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveLayer((current) => getIdleLayerTarget(current, 1));
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;

    const direction = classifyIdlePointer(event.clientX - start.x, event.clientY - start.y);
    if (direction === null) return;
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
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
    >
      <div key={activeLayer} className={classes.layer} data-idle-layer={activeLayer}>
        {panes[activeLayer]}
      </div>
    </div>
  );
};
