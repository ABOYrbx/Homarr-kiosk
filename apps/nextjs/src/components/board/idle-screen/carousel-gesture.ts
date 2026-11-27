const interactiveTargetSelector = [
  "a[href]",
  "area[href]",
  "audio",
  "button",
  "[contenteditable]:not([contenteditable='false'])",
  "[data-idle-interactive]",
  "[draggable='true']",
  "embed",
  "iframe",
  "input",
  "label",
  "object",
  "option",
  "optgroup",
  "select",
  "summary",
  "textarea",
  "video",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='tab']",
  "[tabindex]",
].join(",");

export const isIdleInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return (
    (target instanceof HTMLElement && target.isContentEditable) || target.closest(interactiveTargetSelector) !== null
  );
};

export const isIdleOverlayInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("[data-idle-screen]") !== null && isIdleInteractiveTarget(target);

export const isIdleBackgroundTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element) || target.closest("[data-idle-widget-slot]")) return false;
  return !isIdleInteractiveTarget(target);
};
