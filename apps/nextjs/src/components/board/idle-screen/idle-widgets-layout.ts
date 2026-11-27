import type { RouterOutputs } from "@homarr/api";
import { getBoardLayoutData } from "@homarr/boards/layout-data";
import type { SectionItem } from "@homarr/boards/layout-data";
import { getBoardTabs } from "@homarr/boards/tabs";
import { getBoardLaneColumnCount, getRootSectionLane } from "@homarr/definitions";

import { getLogicalGridSize, LOGICAL_GRID_GAP } from "~/components/board/layout";

type Board = RouterOutputs["board"]["getBoardByName"];

export interface PositionedIdleItem {
  item: SectionItem;
  x: number;
  y: number;
}

/**
 * Projects the items placed in an idle layout into absolute logical pixels.
 * Lane origins are derived from the layout's gutter widths; nested containers
 * add their own offsets to the enclosing lane origin. Only the first board tab
 * is rendered, matching the single-tab idle canvas.
 */
export const resolveIdleItems = (board: Board, layoutId: string): PositionedIdleItem[] => {
  const layout = board.layouts.find((candidate) => candidate.id === layoutId);
  if (!layout) return [];

  const leftRoot = board.sections.find(
    (section) => section.kind === "empty" && getRootSectionLane(section.xOffset) === "left",
  );
  const mainRoot = getBoardTabs(board).at(0);
  const rightRoot = board.sections.find(
    (section) => section.kind === "empty" && getRootSectionLane(section.xOffset) === "right",
  );
  if (!leftRoot && !mainRoot && !rightRoot) return [];

  const mainX = getLogicalGridSize(getBoardLaneColumnCount(layout, "left")) + LOGICAL_GRID_GAP;
  const rightX = mainX + getLogicalGridSize(getBoardLaneColumnCount(layout, "main")) + LOGICAL_GRID_GAP;
  const { itemsBySectionId, innerSectionsByParentId } = getBoardLayoutData(board, layoutId);

  const positioned: PositionedIdleItem[] = [];
  const visited = new Set<string>();
  const collect = (sectionId: string, originX: number, originY: number) => {
    if (visited.has(sectionId)) return;
    visited.add(sectionId);

    for (const item of itemsBySectionId.get(sectionId) ?? []) {
      positioned.push({
        item,
        x: originX + getLogicalGridSize(item.xOffset),
        y: originY + getLogicalGridSize(item.yOffset),
      });
    }
    for (const section of innerSectionsByParentId.get(sectionId) ?? []) {
      collect(section.id, originX + getLogicalGridSize(section.xOffset), originY + getLogicalGridSize(section.yOffset));
    }
  };

  if (leftRoot) collect(leftRoot.id, 0, 0);
  if (mainRoot) collect(mainRoot.id, mainX, 0);
  if (rightRoot) collect(rightRoot.id, rightX, 0);

  return positioned;
};
