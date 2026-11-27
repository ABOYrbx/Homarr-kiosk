# AOD lyrics timing offset — design (short)

## Intent and why

The AOD music layer highlights LRCLIB lyrics using Home Assistant's
`media_position`. Local reproduction with fresh HA timestamps is accurate
(active line/word matched LRCLIB timings exactly), but the user's real setup
(Music Assistant / Apple Music via HA) reports a **constant offset** between
the audible singing and the highlighted line. A single correction value cannot
be guessed in code: it depends on the player, source and track. Give the user a
per-board setting to align lyrics on their own instance.

## Goals

- One adjustable timing offset for AOD lyrics, persisted on the board.
- Applies only to lyrics highlighting; the progress bar and the playback clock
  keep showing HA's position unchanged.
- Works for both directions (lyrics early or late) and without visible
  controls inside the AOD overlay.

## Non-goals / anti-goals

- No change to HA / Music Assistant integration code, LRCLIB parsing, or the
  playback clock logic.
- No automatic offset detection (unreliable) and no global code constant.
- No new controls in the fullscreen AOD overlay (user rule: no visible
  controls there).

## Constraints

- Mantine UI in the board settings; @tabler/icons-react for icons.
- oxlint / oxfmt; no broad test suites; no docs page (setting is discoverable
  in the UI).
- Existing migrations: SQLite 0059, PostgreSQL 0028 — the new ones are 0060
  and 0029, generated with the repo's drizzle-kit scripts (including meta
  snapshots), not hand-written.
- Live DB and browser settings used for verification must be reset afterwards.

## Approaches considered

- **A — per-board offset slider in settings (chosen):** a persisted board field
  that shifts only the position fed to the lyrics view. The user tunes it once
  on the real instance; other boards and players stay unaffected.
- **B — global hardcoded correction:** no migration or UI, but a guessed value
  that cannot fit different players or tracks. Rejected.
- **C — keyboard controls inside the AOD:** quick to try, but breaks the
  "no visible controls" rule and is awkward on a touch kiosk. Rejected.

## Design

### Data

- New board column `idleScreenLyricsOffsetSeconds`: `real` (SQLite) /
  `doublePrecision` (PostgreSQL), `notNull`, `default(0)`.
- Zod: added to `boardSavePartialSettingsSchema` as
  `z.number().min(-15).max(15)`, and to `boardSettingsSchema` with
  `.default(0)`. Optional in the partial schema.
- Migrations generated with `bun run migration:sqlite:generate` and
  `bun run migration:postgresql:generate`.

### Wiring

- Add the field to every board-settings projection/default it belongs in:
  `packages/api` board router select + save maps, onboarding defaults,
  `assistant-board-settings-tool`, header runtime mock, board test mock,
  `_settings-form` field list/defaults, `_layout-creator` initial AOD settings,
  `IdleScreenSettings`, `MusicPane` → `NowPlaying`.
- `NowPlaying` passes `position - idleScreenLyricsOffsetSeconds` to
  `LyricsPanel` (null stays null). Progress bar, times and playback clock keep
  using the unshifted `position`.
- Sign convention: **positive = lyrics appear later**. The setting description
  tells the user: if lyrics run ahead of the singing, increase the value; if
  they lag, decrease it.

### UI

- Mantine `Input.Wrapper` + `Slider` in `_behavior.tsx`, directly below the
  "Show lyrics" switch and only rendered while that switch is on.
- Range -15…+15 s, step 0.5, marks at -10 / -5 / 0 / +5 / +10, thumb label
  shows the signed value in seconds. Same style as the widget-scale slider.
- i18n keys `field.idleScreenLyricsOffsetSeconds.label` / `.description` in
  `en.json` and `de.json`.

### Verification

- Focused Vitest run for the touched projects, typecheck, oxlint/oxfmt.
- Live browser check on the demo board with a known track: set an offset,
  confirm the highlighted line/word moves by that amount while the progress
  time stays unchanged; reset the temporary setting afterwards.
- No user-facing docs (per repository rule).

## Left to the implementer

- Exact file/line insertion points and generated migration filenames.
- Keep all temporary test state (board settings, Redis mock, browser tab)
  restored before finishing.
