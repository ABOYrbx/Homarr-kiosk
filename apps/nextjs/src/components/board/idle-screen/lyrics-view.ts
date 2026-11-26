export interface LyricWord {
  text: string;
  start: number;
  end: number;
}

export interface LyricLine {
  start: number;
  end: number;
  words: LyricWord[];
}

export interface LyricsViewData {
  type: "syllable" | "line" | "static";
  lines: LyricLine[];
  source?: string;
  provider?: string;
  uploader?: { username: string; url: string };
  maker?: { username: string; url: string };
}

/**
 * Index of the line that contains `position`, or -1 before the first line.
 * After the last line the last index stays active instead of jumping away.
 */
export const findActiveLineIndex = (lines: readonly LyricLine[], position: number | null): number => {
  if (position === null || lines.length === 0) return -1;
  let active = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line && line.start <= position) active = index;
    else break;
  }
  return active;
};

/** Index of the word currently being sung inside the active line, or -1. */
export const findActiveWordIndex = (line: LyricLine | undefined, position: number | null): number => {
  if (!line || position === null) return -1;
  let active = -1;
  for (let index = 0; index < line.words.length; index++) {
    const word = line.words[index];
    if (word && word.start <= position) active = index;
    else break;
  }
  return active;
};

/** Effective line end: the configured end, or the next line's start. */
export const effectiveLineEnd = (lines: readonly LyricLine[], index: number): number => {
  const line = lines[index];
  if (!line) return 0;
  if (line.end > 0) return line.end;
  const nextStart = lines[index + 1]?.start;
  if (nextStart !== undefined && nextStart > line.start) return nextStart;
  const wordEnd = line.words.reduce((max, word) => Math.max(max, word.end ?? 0), 0);
  return wordEnd > 0 ? wordEnd : line.start;
};

/** Stable identity for a track so lyrics are reloaded only on a real change. */
export const buildTrackKey = ({
  mediaContentId,
  mediaTitle,
  mediaArtist,
  mediaDuration,
}: {
  mediaContentId?: string;
  mediaTitle?: string;
  mediaArtist?: string;
  mediaDuration?: number;
}): string =>
  [
    mediaContentId?.trim() || "",
    mediaTitle?.trim() || "",
    mediaArtist?.trim() || "",
    Number.isFinite(mediaDuration) ? Math.round(mediaDuration as number) : 0,
  ].join("|");
