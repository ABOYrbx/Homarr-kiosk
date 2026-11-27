"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "@mantine/hooks";

import { useI18n } from "@homarr/translation/client";

import { effectiveLineEnd, findActiveLineIndex, findActiveWordIndex } from "./lyrics-view";
import type { LyricsViewData } from "./lyrics-view";
import classes from "./idle-screen.module.css";

const PROVIDER_URL = "https://lrclib.net";

interface LineProps {
  index: number;
  text: string;
  words: LyricsViewData["lines"][number]["words"];
  status: "past" | "active" | "future" | "static";
  highlightWord: number;
  showWords: boolean;
  register: (index: number, element: HTMLParagraphElement | null) => void;
}

const LyricLineView = memo(({ index, text, words, status, highlightWord, showWords, register }: LineProps) => (
  <p
    ref={(element) => register(index, element)}
    className={`${classes.lyricLine} ${classes[`lyric${status}`]}`}
    data-active={status === "active"}
  >
    {showWords
      ? words.map((word, wordIndex) => (
          <span
            key={`${wordIndex}-${word.text}`}
            className={wordIndex === highlightWord && status === "active" ? classes.lyricActiveWord : undefined}
          >
            {word.text}
          </span>
        ))
      : text}
  </p>
));
LyricLineView.displayName = "LyricLineView";

export const LyricsPanel = ({ lyrics, position }: { lyrics: LyricsViewData; position: number | null }) => {
  const t = useI18n("board");
  const reducedMotion = useReducedMotion();
  // Static lyrics have no timings: show a calm text block without fake sync.
  const isStatic = lyrics.type === "static";
  const activeIndex = isStatic ? -1 : findActiveLineIndex(lyrics.lines, position);
  const activeLine = activeIndex >= 0 ? lyrics.lines[activeIndex] : undefined;
  const wordIndex = !isStatic && lyrics.type === "syllable" ? findActiveWordIndex(activeLine, position) : -1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Seeking back before the first line removes the highlight. Scroll back
    // to the start instead of leaving the view on the old lines.
    if (activeIndex < 0) {
      container.scrollTop = 0;
      return;
    }
    const element = lineRefs.current[activeIndex];
    if (!element) return;
    // offsetTop is measured against offsetParent (.musicContent), not the
    // scroll container. Derive the offset from viewport rects so the active
    // line is centred even with nested layout/padding.
    const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTop = Math.max(0, offset - container.clientHeight / 2 + element.clientHeight / 2);
  }, [activeIndex]);

  // A stable ref callback keeps the memoized lines from re-rendering on every
  // 250 ms playback tick; only the active line/word props change.
  const register = useCallback((index: number, element: HTMLParagraphElement | null) => {
    lineRefs.current[index] = element;
  }, []);

  return (
    <section className={classes.lyricsPanel} aria-label={t("idleScreen.lyricsLabel")}>
      <div
        ref={scrollRef}
        className={classes.lyricsScroll}
        style={{ scrollBehavior: reducedMotion ? "auto" : "smooth" }}
      >
        {!isStatic && <div className={classes.lyricsSpacer} />}
        {lyrics.lines.map((line, index) => {
          const text = line.words.map((word) => word.text).join("");
          const status: LineProps["status"] = isStatic
            ? "static"
            : index > activeIndex && activeIndex >= 0
              ? "future"
              : index === activeIndex
                ? "active"
                : "past";
          const inRange =
            activeIndex >= 0 &&
            position !== null &&
            position >= line.start &&
            position <= effectiveLineEnd(lyrics.lines, index);
          return (
            <LyricLineView
              key={`${line.start}-${index}`}
              index={index}
              text={text}
              words={line.words}
              status={status}
              highlightWord={inRange ? wordIndex : -1}
              showWords={lyrics.type === "syllable"}
              register={register}
            />
          );
        })}
        {!isStatic && <div className={classes.lyricsSpacer} />}
      </div>
      <div className={classes.lyricsAttribution}>
        <a href={PROVIDER_URL} target="_blank" rel="noreferrer">
          {t("idleScreen.attribution")}
        </a>
      </div>
    </section>
  );
};
