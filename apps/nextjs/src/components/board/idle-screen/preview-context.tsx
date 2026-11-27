"use client";

import type { PropsWithChildren } from "react";
import { createContext, useContext, useState } from "react";

interface IdleScreenPreviewContextValue {
  previewOpen: boolean;
  openPreview: () => void;
  closePreview: () => void;
}

const IdleScreenPreviewContext = createContext<IdleScreenPreviewContextValue | null>(null);

export const isIdleScreenOpen = ({ previewOpen, timerOpen }: { previewOpen: boolean; timerOpen: boolean }): boolean =>
  previewOpen || timerOpen;

export const IdleScreenPreviewProvider = ({ children }: PropsWithChildren) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <IdleScreenPreviewContext.Provider
      value={{
        previewOpen,
        openPreview: () => setPreviewOpen(true),
        closePreview: () => setPreviewOpen(false),
      }}
    >
      {children}
    </IdleScreenPreviewContext.Provider>
  );
};

export const useIdleScreenPreview = (): IdleScreenPreviewContextValue => {
  const context = useContext(IdleScreenPreviewContext);
  if (!context) throw new Error("useIdleScreenPreview must be used within IdleScreenPreviewProvider");
  return context;
};
