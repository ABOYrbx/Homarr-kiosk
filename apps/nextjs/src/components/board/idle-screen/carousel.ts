export type IdleLayer = "music" | "clock" | "widgets";

export const idleLayerOrder: readonly IdleLayer[] = ["music", "clock", "widgets"];

export const getIdleLayerTarget = (current: IdleLayer, delta: -1 | 1): IdleLayer => {
  const currentIndex = idleLayerOrder.indexOf(current);
  const targetIndex = Math.min(Math.max(currentIndex + delta, 0), idleLayerOrder.length - 1);
  return idleLayerOrder[targetIndex] ?? current;
};

export const classifyIdlePointer = (dx: number, dy: number, threshold = 48): -1 | 1 | null => {
  if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? -1 : 1;
  return null;
};
