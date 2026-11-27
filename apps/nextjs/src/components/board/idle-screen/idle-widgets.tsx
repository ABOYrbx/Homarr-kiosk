"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Center, Text } from "@mantine/core";

import { useOptionalBoard } from "@homarr/boards/context";
import { useI18n } from "@homarr/translation/client";

import { BoardAdvancedFocusProvider } from "../advanced-focus/context";
import { BoardItemContent } from "../items/item-content";
import { getLogicalGridSize } from "../layout";
import { BoardGridPortalHost } from "../sections/grid/grid-portal-host";
import classes from "./idle-screen.module.css";
import { resolveIdleItems } from "./idle-widgets-layout";

const viewportPadding = 32;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toBackgroundImage = (value: string) =>
  `url("${value.replace(/["\\\n\r]/g, (character) => encodeURIComponent(character))}")`;

export const getIdleWidgetScale = ({ fitScale, userScale }: { fitScale: number; userScale: number }): number => {
  if (!Number.isFinite(fitScale) || !Number.isFinite(userScale)) return 1;
  return clamp(fitScale * userScale, 0.2, 2);
};

export const clampIdlePan = ({
  offset,
  scaledSize,
  viewportSize,
  padding,
}: {
  offset: number;
  scaledSize: number;
  viewportSize: number;
  padding: number;
}): number => {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(scaledSize) ||
    !Number.isFinite(viewportSize) ||
    !Number.isFinite(padding)
  ) {
    return 0;
  }

  const limit = Math.max(0, (scaledSize - (viewportSize - 2 * padding)) / 2);
  return clamp(offset, -limit, limit);
};

interface PanStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
}

export const IdleWidgets = ({ layoutId }: { layoutId: string }) => {
  const t = useI18n("board");
  const board = useOptionalBoard();
  const items = useMemo(() => (board ? resolveIdleItems(board, layoutId) : []), [board, layoutId]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<PanStart | null>(null);
  const userScale = board?.idleScreenWidgetScale ?? 1;
  const background = board?.idleScreenWidgetBackground?.trim() || null;
  const frosted = board?.idleScreenWidgetBackgroundFrost ?? true;

  useLayoutEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const contentWidth = Math.max(1, ...items.map(({ item, x }) => x + getLogicalGridSize(item.width)));
  const contentHeight = Math.max(1, ...items.map(({ item, y }) => y + getLogicalGridSize(item.height)));
  // The logical canvas keeps its fixed geometry; scale the whole surface so a
  // 12-column layout still fits a kiosk viewport without clipping any widget.
  const fitScale =
    viewport.width === 0
      ? 1
      : Math.min(
          1,
          (viewport.width - 2 * viewportPadding) / contentWidth,
          (viewport.height - 2 * viewportPadding) / contentHeight,
        );
  const scale = getIdleWidgetScale({ fitScale, userScale });

  useEffect(() => {
    panStart.current = null;
    setPan({ x: 0, y: 0 });
  }, [scale, viewport.width, viewport.height]);

  if (!board || !board.layouts.some((layout) => layout.id === layoutId) || items.length === 0) {
    return (
      <Center h="100%" p="xl">
        <Text c="gray.4" size="lg" ta="center">
          {t("idleScreen.widgets.empty")}
        </Text>
      </Center>
    );
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      panStart.current = null;
      return;
    }
    // Only drags starting on a widget pan the surface. Background gestures stay
    // with the carousel for layer switching and closing the idle screen.
    if (!(event.target instanceof Element) || !event.target.closest("[data-idle-widget-slot]")) return;
    panStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = panStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPan({
      x: clampIdlePan({
        offset: start.originX + (event.clientX - start.clientX),
        scaledSize: contentWidth * scale,
        viewportSize: viewport.width,
        padding: viewportPadding,
      }),
      y: clampIdlePan({
        offset: start.originY + (event.clientY - start.clientY),
        scaledSize: contentHeight * scale,
        viewportSize: viewport.height,
        padding: viewportPadding,
      }),
    });
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStart.current?.pointerId === event.pointerId) panStart.current = null;
  };

  const style: CSSProperties = {
    width: contentWidth,
    height: contentHeight,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
  };

  return (
    <BoardAdvancedFocusProvider>
      <BoardGridPortalHost>
        <div
          className={classes.widgetsFrame}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {background && (
            <>
              <div
                aria-hidden="true"
                className={frosted ? classes.widgetBackgroundFrosted : classes.widgetBackground}
                style={{ backgroundImage: toBackgroundImage(background) }}
              />
              <div aria-hidden="true" className={classes.widgetBackgroundScrim} />
            </>
          )}
          <div className={classes.widgets} style={style}>
            {items.map(({ item, x, y }) => (
              <div
                key={item.id}
                className={classes.widgetSlot}
                data-idle-widget-slot=""
                style={{
                  left: x,
                  top: y,
                  width: getLogicalGridSize(item.width),
                  height: getLogicalGridSize(item.height),
                }}
              >
                <BoardItemContent item={item} />
              </div>
            ))}
          </div>
        </div>
      </BoardGridPortalHost>
    </BoardAdvancedFocusProvider>
  );
};
