/** Escape characters that could break out of a CSS url("...") value. */
export const toIdleBackgroundImage = (value: string) =>
  `url("${value.replace(/["\\\n\r]/g, (character) => encodeURIComponent(character))}")`;
