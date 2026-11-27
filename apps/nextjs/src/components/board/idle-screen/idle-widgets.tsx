"use client";

import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useState } from "react";

import { useOptionalBoard } from "@homarr/boards/context";

import { BoardAdvancedFocusProvider } from "../advanced-focus/context";
import { BoardItemContent } from "../items/item-content";
import { getLogicalGridSize } from "../layout";
import { BoardGridPortalHost } from "../sections/grid/grid-portal-host";
import classes from "./idle-screen.module.css";
import { resolveIdleItems } from "./idle-widgets-layout";

const viewportPadding = 32;

export const IdleWidgets = ({ layoutId }: { layoutId: string }) => {
  const board = useOptionalBoard();
  const items = useMemo(() => (board ? resolveIdleItems(board, layoutId) : []), [board, layoutId]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!board || !board.layouts.some((layout) => layout.id === layoutId) || items.length === 0) return null;

  const contentWidth = Math.max(1, ...items.map(({ item, x }) => x + getLogicalGridSize(item.width)));
  const contentHeight = Math.max(1, ...items.map(({ item, y }) => y + getLogicalGridSize(item.height)));
  // The logical canvas keeps its fixed geometry; scale the whole surface so a
  // 12-column layout still fits a kiosk viewport without clipping any widget.
  const scale =
    viewport.width === 0
      ? 1
      : Math.min(
          1,
          (viewport.width - 2 * viewportPadding) / contentWidth,
          (viewport.height - 2 * viewportPadding) / contentHeight,
        );
  const style = {
    width: contentWidth,
    height: contentHeight,
    "--idle-widgets-scale": Math.max(0.2, scale),
  } as CSSProperties;

  return (
    <BoardAdvancedFocusProvider>
      <BoardGridPortalHost>
        <div className={classes.widgets} style={style}>
          {items.map(({ item, x, y }) => (
            <div
              key={item.id}
              className={classes.widgetSlot}
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
      </BoardGridPortalHost>
    </BoardAdvancedFocusProvider>
  );
};
