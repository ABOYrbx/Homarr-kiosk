import { clientApi } from "@homarr/api/client";

import type { Board } from "../../_types";

export const useSavePartialSettingsMutation = (board: Board) => {
  const utils = clientApi.useUtils();
  return clientApi.board.savePartialBoardSettings.useMutation({
    async onSettled() {
      await Promise.all([
        utils.board.getBoardByName.refetch({ name: board.name }),
        utils.board.getHomeBoard.invalidate(),
      ]);
    },
  });
};

export const useSaveLayoutsMutation = (board: Board) => {
  const utils = clientApi.useUtils();
  return clientApi.board.saveLayouts.useMutation({
    async onSettled() {
      await Promise.all([
        utils.board.getBoardByName.refetch({ name: board.name }),
        utils.board.getHomeBoard.invalidate(),
      ]);
    },
  });
};
