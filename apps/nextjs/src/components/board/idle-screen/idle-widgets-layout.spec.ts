import type { RouterOutputs } from "@homarr/api";
import { describe, expect, it } from "vitest";

import { BoardMockBuilder } from "~/components/board/items/actions/test/mocks/board-mock";
import { ContainerSectionMockBuilder } from "~/components/board/items/actions/test/mocks/container-section-mock";
import { EmptySectionMockBuilder } from "~/components/board/items/actions/test/mocks/empty-section-mock";
import { ItemMockBuilder } from "~/components/board/items/actions/test/mocks/item-mock";
import { resolveIdleItems } from "./idle-widgets-layout";

type IdleBoard = RouterOutputs["board"]["getBoardByName"];

const boardWithIdleLayout = (): IdleBoard =>
  new BoardMockBuilder()
    .addSections([
      new EmptySectionMockBuilder({ id: "left", xOffset: -1 }).build(),
      new EmptySectionMockBuilder({ id: "main" }).build(),
      new EmptySectionMockBuilder({ id: "right", xOffset: 1 }).build(),
      new ContainerSectionMockBuilder({ id: "container" })
        .addLayout({ layoutId: "idle", parentSectionId: "main", xOffset: 1, yOffset: 3, width: 3, height: 3 })
        .build(),
    ])
    .addItem(
      new ItemMockBuilder({ id: "idle-left" })
        .addLayout({ layoutId: "idle", sectionId: "left", xOffset: 0, yOffset: 1, width: 1, height: 1 })
        .build(),
    )
    .addItem(
      new ItemMockBuilder({ id: "idle-main" })
        .addLayout({ layoutId: "idle", sectionId: "main", xOffset: 1, yOffset: 2, width: 2, height: 1 })
        .build(),
    )
    .addItem(
      new ItemMockBuilder({ id: "idle-nested" })
        .addLayout({ layoutId: "idle", sectionId: "container", xOffset: 1, yOffset: 1, width: 1, height: 1 })
        .build(),
    )
    .addItem(
      new ItemMockBuilder({ id: "idle-right" })
        .addLayout({ layoutId: "idle", sectionId: "right", xOffset: 0, yOffset: 0, width: 1, height: 1 })
        .build(),
    )
    .addItem(
      new ItemMockBuilder({ id: "base-main" })
        .addLayout({ layoutId: "base", sectionId: "main", xOffset: 0, yOffset: 0, width: 1, height: 1 })
        .build(),
    )
    .addLayout({
      id: "idle",
      name: "Idle",
      columnCount: 12,
      leftGutterColumnCount: 2,
      rightGutterColumnCount: 1,
      breakpoint: 900,
      role: "custom",
    })
    .build();

describe("resolveIdleItems", () => {
  it("returns only items whose layout matches the idle layout", () => {
    const board = boardWithIdleLayout();
    const items = resolveIdleItems(board, "idle");
    expect(items.length).toBeGreaterThan(0);
    // SectionItem carries the matching ItemLayout directly, not the source item's layouts array.
    expect(items.every(({ item }) => item.layoutId === "idle")).toBe(true);
  });

  it("returns an empty list for a missing layout or empty board", () => {
    expect(resolveIdleItems(boardWithIdleLayout(), "missing")).toEqual([]);
    expect(resolveIdleItems({ ...boardWithIdleLayout(), items: [] }, "idle")).toEqual([]);
    expect(resolveIdleItems({ ...boardWithIdleLayout(), sections: [] }, "idle")).toEqual([]);
  });

  it("adds lane origins and nested section offsets in logical grid pixels", () => {
    // 212px per track (200px cell + 12px gap); 12 columns split into 2/9/1 lanes.
    expect(resolveIdleItems(boardWithIdleLayout(), "idle").map(({ item, x, y }) => ({ id: item.id, x, y }))).toEqual([
      { id: "idle-left", x: 0, y: 212 },
      { id: "idle-main", x: 648, y: 424 },
      { id: "idle-nested", x: 860, y: 848 },
      { id: "idle-right", x: 2356, y: 0 },
    ]);
  });
});
