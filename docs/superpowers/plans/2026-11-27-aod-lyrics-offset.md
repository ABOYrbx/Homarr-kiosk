# AOD Lyrics Timing Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AOD music layer a per-board lyrics timing offset so the user can align LRCLIB highlighting with a HA player that reports a constant-offset position.

**Architecture:** A new board column carries the offset in seconds. The settings form exposes it as a Mantine slider next to the lyrics switch; the value is threaded through `IdleScreenSettings` → `MusicPane` → `NowPlaying`, where a pure helper shifts only the position passed to `LyricsPanel`. The playback clock and progress bar keep HA's unshifted position.

**Tech Stack:** Next.js, Mantine, drizzle-kit (SQLite + PostgreSQL), zod v4, vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-11-27-aod-lyrics-offset-design.md`

## Global Constraints

- Follow `AGENTS.md`: Mantine + @tabler/icons-react, oxlint (not ESLint), oxfmt (not Prettier), no broad test/E2E suites, no docs page for this UI setting.
- No upstream PR and no push. Commit locally only.
- Field name: `idleScreenLyricsOffsetSeconds`; DB column `idle_screen_lyrics_offset_seconds`; `real` (SQLite) / `doublePrecision` (PostgreSQL), `notNull`, `default(0)`.
- Range -15…15, step 0.5, default 0. Positive value means **lyrics appear later** (`lyricsPosition = position - offset`).
- Migrations: SQLite next number 0060, PostgreSQL next number 0029; generate with the repo scripts so meta snapshots are produced.
- Reset any temporary board settings, Redis mock state and browser tabs after verification.

## Review Focus

- **Old boards with no value:** every consumer must fall back to `0`; a missing value must never shift lyrics — covered by Task 3 defaults and Task 4 `?? 0`.
- **Sign direction:** positive offset delays the highlight; a negative one advances it — covered by Task 1 helper test.
- **Out-of-range / malformed values:** partial-save zod rejects values outside -15…15; DB default covers legacy rows — covered by Task 1 validation test.
- **Progress bar independence:** the offset must not touch the progress bar, time labels or playback clock — covered by Task 3 code placement (only the `LyricsPanel` prop is shifted) and Task 5 live check.
- **Localization:** label and description exist in both `en.json` and `de.json` — covered by Task 4.

---

### Task 1: Validation and offset helper (red/green)

**Files:**
- Modify: `packages/validation/src/board.ts:92`, `:101`, `:111`
- Modify: `packages/validation/src/board.spec.ts` (add a focused bounds case next to the existing widget-scale case)
- Modify: `apps/nextjs/src/components/board/idle-screen/playback.ts` (new exported helper after `formatDuration`)
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts` (new `describe` for the helper)

**Interfaces:**
- Consumes: nothing new.
- Produces: `z.number().min(-15).max(15)` on `boardSavePartialSettingsSchema.idleScreenLyricsOffsetSeconds`; `.default(0)` on `boardSettingsSchema`; `offsetLyricsPosition(position: number | null, offsetSeconds: number): number | null`.

- [ ] **Step 1: Write failing tests.** In `idle-screen.spec.ts` import `offsetLyricsPosition` and assert `offsetLyricsPosition(50, 3) === 47`, `offsetLyricsPosition(50, -3) === 53`, `offsetLyricsPosition(null, 3) === null`. In `board.spec.ts` assert `boardSavePartialSettingsSchema.parse({ idleScreenLyricsOffsetSeconds: -2.5 })` keeps `-2.5`, and that `16` and `-16` throw; assert `boardSettingsSchema.shape.idleScreenLyricsOffsetSeconds.parse(undefined) === 0`.

- [ ] **Step 2: Run the tests and confirm they fail** with "not a function" / missing schema key.

Run: `bunx vitest run --project dom apps/nextjs/src/components/board/idle-screen/ packages/validation/src/board.spec.ts`

- [ ] **Step 3: Implement the helper and schema fields.** Helper returns `null` for a null position and otherwise `position - offsetSeconds`. Add the field to the partial schema and the `.default(0)` field in `boardSettingsSchema`.

- [ ] **Step 4: Run the same tests and confirm they pass.**

- [ ] **Step 5: Commit** with `git add` on the four files and message `feat: add AOD lyrics offset validation and helper`.

### Task 2: Database columns and migrations

**Files:**
- Modify: `packages/db/schema/sqlite.ts:303` area (add after `idleScreenWidgetBackgroundFrost`)
- Modify: `packages/db/schema/postgresql.ts:319` area (same position)
- Create via generator: `packages/db/migrations/sqlite/0060_*.sql` + `meta/0060_snapshot.json`
- Create via generator: `packages/db/migrations/postgresql/0029_*.sql` + `meta/0029_snapshot.json`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `board.idleScreenLyricsOffsetSeconds` in both Drizzle schemas with DB default 0.

- [ ] **Step 1: Add the two schema fields** using the same declaration style as `idleScreenWidgetScale` but with `default(0)` and no range at DB level.

- [ ] **Step 2: Generate migrations** with `bun run --filter @homarr/db migration:sqlite:generate` and `bun run --filter @homarr/db migration:postgresql:generate`; inspect the generated SQL to confirm a single `ADD COLUMN ... DEFAULT 0 NOT NULL` per dialect and no unrelated changes.

- [ ] **Step 3: Apply SQLite migration to the local gitignored DB** with `bun run --filter @homarr/db migration:sqlite:run`.

- [ ] **Step 4: Commit** schema and generated migration files with message `feat(db): add board lyrics timing offset column`.

### Task 3: Thread the field through API, defaults and AOD components

**Files:**
- Modify: `packages/api/src/router/board.ts:1273` (select map), `:1807` (save map), and the two MCP descriptions at `:1238`, `:1763` (list the new field)
- Modify: `packages/api/src/router/onboard/onboard-router.ts:425` (default `idleScreenLyricsOffsetSeconds: 0`)
- Modify: `apps/nextjs/src/components/assistant/assistant-board-settings-tool.tsx:93` (forward field)
- Modify: `apps/nextjs/src/components/layout/header/header-widget-runtime-boundary.tsx:41` (mock default 0)
- Modify: `apps/nextjs/src/components/board/items/actions/test/mocks/board-mock.ts:38` (mock default 0)
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_settings-form.tsx:75`, `:106` (field list and initial value `board.idleScreenLyricsOffsetSeconds ?? 0`)
- Modify: `apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx:130` (AOD settings object)
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx:33`, `:191` (settings interface and `MusicPane` prop)
- Modify: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx:42`, `:64`, `:74` (prop through `ConfiguredMusicPane` to `NowPlaying`)
- Modify: `apps/nextjs/src/components/board/idle-screen/now-playing.tsx` (new prop; pass `offsetLyricsPosition(position, lyricsOffsetSeconds)` only to `LyricsPanel`)

**Interfaces:**
- Consumes: `offsetLyricsPosition` from Task 1 and the DB field from Task 2.
- Produces: `IdleScreenSettings.idleScreenLyricsOffsetSeconds: number`; `NowPlaying` prop `lyricsOffsetSeconds: number`.

- [ ] **Step 1: Add the field to API select/save maps, descriptions, onboarding and mocks**, using `0` as the fallback wherever an object is constructed by hand.

- [ ] **Step 2: Add it to the settings form field list and `buildInitialValues`**, using `board.idleScreenLyricsOffsetSeconds ?? 0`.

- [ ] **Step 3: Thread it through `IdleScreenSettings`, `_layout-creator`, `MusicPane` and `NowPlaying`.** In `NowPlaying`, call `offsetLyricsPosition(position, lyricsOffsetSeconds)` inline at the `LyricsPanel` `position` prop; leave every other use of `position` untouched.

- [ ] **Step 4: Verify** with `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/api --filter=@homarr/validation --filter=@homarr/db` and `bunx oxlint apps/nextjs/src/components/board/idle-screen packages/api/src/router/board.ts`.

- [ ] **Step 5: Commit** with message `feat: thread AOD lyrics offset into the music layer`.

### Task 4: Settings slider and translations

**Files:**
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx:171-175` (slider after the lyrics `Switch`, conditionally rendered)
- Modify: `packages/translation/src/lang/en.json` and `de.json` next to `idleScreenShowLyrics` (new `idleScreenLyricsOffsetSeconds.label` / `.description`)

**Interfaces:**
- Consumes: the form field added in Task 3.
- Produces: no new API.

- [ ] **Step 1: Add the slider** using `Input.Wrapper` + Mantine `Slider` with `min={-15}`, `max={15}`, `step={0.5}`, marks at `-10/-5/0/5/10`, `thumbLabel` showing the signed seconds value, and `onChange` writing `form.setFieldValue("idleScreenLyricsOffsetSeconds", value)`. Render it only when `form.values.idleScreenShowLyrics` is true. Match the widget-scale slider's spacing props.

- [ ] **Step 2: Add translations.** English description must state the sign convention: positive delays the lyrics; if lyrics run ahead of the singing, increase the value. German equivalent in `de.json`.

- [ ] **Step 3: Verify** with `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/translation`, `bunx oxfmt` on touched files, and `bunx oxlint` on the settings folder.

- [ ] **Step 4: Commit** with message `feat: add AOD lyrics offset slider to board settings`.

### Task 5: Live verification and cleanup (no commit)

**Files:** none (temporary settings only)

- [ ] **Step 1: Start the demo AOD preview** with Redis and the standalone WebSocket server running; configure the mock player with the "Blinding Lights" track (word-synced lyrics, first line at 27.4 s) through the existing test-cookie tRPC flow.

- [ ] **Step 2: Confirm the offset works visually.** With offset 0, record the active line/word at a known progress time; set offset to +3 s through the settings form, save and reopen the preview; the highlighted line must be earlier in the lyric list while the displayed progress time is unchanged. Repeat with -3 s.

- [ ] **Step 3: Confirm the slider appears only with lyrics enabled** and that the value survives save/reload.

- [ ] **Step 4: Reset** the board settings to their prior values, remove the Redis mock entry, and close the browser tab. Final check: `git status --short` shows only the intended committed changes and the pre-existing untracked user files.
