# AOD-Vorschau und Drei-Ebenen-Karussell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Leerlaufbildschirm per Button sofort als Vorschau öffnen und als Drei-Ebenen-Karussell (Musik / Uhr+Wetter / eigene Widgets) mit Wisch- und Tastaturnavigation darstellen.

**Architecture:** Zwei neue, nullable Board-Felder (Wetterstandort, Uhr-Akzentfarbe) plus additive Migrationen. Ein Preview-Context im gemeinsamen Board-Layout öffnet den AOD unabhängig vom Idle-Timer; eine Karussell-Komponente hält die aktive Ebene und rendert die drei bestehenden Oberflächen (`NowPlaying`, `AnalogClock`+Wetter, `IdleWidgets`). Die Modus-Auswahl verschwindet aus der UI, das DB-Feld bleibt ungenutzt liegen.

**Tech Stack:** Next.js 16 (App Router), Mantine, `@tabler/icons-react`, tRPC, Drizzle (SQLite + PostgreSQL), Zod v4, Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-11-27-aod-carousel-preview-design.md`

## Global Constraints

- Mantine + `@tabler/icons-react`, kein Tailwind außerhalb der Docs-App. Lint oxlint, Format oxfmt.
- Kein Upstream-PR, kein Push.
- Keine Custom-Widget-Sandbox-Lockerung; `iframe` bleibt eingebaute Widget-Art; `customApi` bleibt Admin-only.
- Keine Änderung an UV/DPMS, `requestFullscreen`, der eigentlichen Musik-/Lyrics-Logik, den Layout-Rollen `mobile`/`base` oder der normalen Board-Darstellung.
- Keine breiten Test-/E2E-Suites – nur fokussierte Vitest-Tests, gezielte Typechecks, lint/format und ein Live-Check.
- Migrationen additiv: neue Spalten nullable bzw. mit Default, keine destruktiven Änderungen.
- Neue UI-Texte nach `packages/translation/src/lang/en.json` und `de.json`; Widget-Inhalte werden nicht übersetzt.
- Die Vorschau zeigt den **gespeicherten** Board-Zustand; keine Formular-Entwürfe werden in den Overlay übertragen.

## Review Focus

- **Preview-Button löst `pointerdown`/`keydown` aus und der Idle-Timer schließt den Overlay sofort wieder** → Task 2 testet `isIdleScreenOpen` und die `paused`-Übergabe an `useIdleScreen`.
- **Musik-Ebene ohne konfigurierte HA-Entity oder ohne laufenden Titel darf nicht leer bleiben oder zur Uhr springen** → Task 5 testet `getMusicPaneState` für `not-configured`, `no-track`, `ready`.
- **Schnelle oder schräge Wischs dürfen die Ebene nicht überspringen, und ein Tap auf ein Widget darf nicht navigieren** → Task 3 testet `getIdleLayerTarget` mit Clamping am Anfang/Ende und `classifyIdlePointer` mit Schwellenwert.
- **Fehlender Wetterstandort oder `null` vom Wetter-Endpunkt darf die Uhr nicht brechen** → Task 4 testet `getIdleWeatherInput` für `null` und für das Fallback-Widget.
- **Cover fehlt oder reduzierte Bewegung ist aktiv** → Task 5 testet `getMusicPaneState` ohne Artwork und der Live-Check prüft den statischen Backdrop unter `prefers-reduced-motion`.

---

### Task 1: Datenmodell, Validierung, Router und i18n

**Files:**
- Modify: `packages/db/schema/sqlite.ts:294-302`
- Modify: `packages/db/schema/postgresql.ts:309-317`
- Modify: `packages/validation/src/board.ts:85-93`
- Modify: `packages/api/src/router/board.ts:1266-1274`, `packages/api/src/router/board.ts:1755-1800`
- Modify: `packages/translation/src/lang/en.json` (`board.field`), `packages/translation/src/lang/de.json` (`board.field`)
- Test: `packages/validation/src/board.spec.ts`
- Generated (commit): `packages/db/migrations/sqlite/0057_*`, `packages/db/migrations/postgresql/0026_*` und jeweils `meta/`

**Interfaces:**
- Consumes: `hexColorSchema` (bereits in `@homarr/validation`), `boardSavePartialSettingsSchema`.
- Produces: `idleScreenWeatherLocation: { name: string; latitude: number; longitude: number } | null` und `idleScreenClockColor: string` auf `Board`, `getBoardSettings` und `savePartialBoardSettings`; Default-Farbe `#1b3a5c`. Neue i18n-Keys `board.field.idleScreenWeatherLocation.{label,description,search,select,unknown}`, `board.field.idleScreenClockColor.{label,description}` und `board.field.idleScreenPreview.{label,description,button}`.

- [ ] **Step 1: Schreib den failing Test in `packages/validation/src/board.spec.ts`**

```ts
it("accepts the idle weather location and clock color", () => {
  expect(
    boardSavePartialSettingsSchema.parse({
      idleScreenWeatherLocation: { name: "Bern", latitude: 46.95, longitude: 7.45 },
      idleScreenClockColor: "#1b3a5c",
    }),
  ).toMatchObject({
    idleScreenWeatherLocation: { name: "Bern", latitude: 46.95, longitude: 7.45 },
    idleScreenClockColor: "#1b3a5c",
  });
});

it("rejects an invalid clock color and out-of-range coordinates", () => {
  expect(() => boardSavePartialSettingsSchema.parse({ idleScreenClockColor: "blue" })).toThrow();
  expect(() =>
    boardSavePartialSettingsSchema.parse({
      idleScreenWeatherLocation: { name: "X", latitude: 100, longitude: 0 },
    }),
  ).toThrow();
});
```

- [ ] **Step 2: Test laufen lassen, erwarteter Fehler**

Run: `bunx vitest run packages/validation/src/board.spec.ts`
Expected: FAIL – `idleScreenWeatherLocation` und `idleScreenClockColor` unbekannt.

- [ ] **Step 3: Schemas, DB-Spalten, Router und Texte ergänzen**

`idleScreenWeatherLocation` als `z.object({ name: z.string(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).nullable()` in das bestehende `.partial()`-Objekt aufnehmen; `idleScreenClockColor` als `hexColorSchema.default("#1b3a5c")`. In beiden DB-Schemas `idleScreenWeatherLocation: text()` (JSON-String) und `idleScreenClockColor: text().default("#1b3a5c").notNull()` ergänzen. `getBoardSettings`-Spaltenliste und `savePartialBoardSettings`-Update um beide Felder erweitern, MCP-Beschreibung entsprechend ergänzen. Die sechs neuen Keys in beiden Sprachdateien anlegen (de: „Wetterstandort", „Standort für Wetter-Icon und Temperatur suchen", „Suchen", „Auswählen", „Unbekannt", „Uhr-Hintergrundfarbe", „Dezenter Verlauf im Leerlauf-Hintergrund"; en analog).

- [ ] **Step 4: Migrationen generieren**

Run: `bun run db:migration:sqlite:generate && bun run db:migration:postgresql:generate`
Expected: eine neue SQLite- und eine neue PostgreSQL-Migration mit `ADD COLUMN ... text`, `notNull: false` für den Standort und Default `#1b3a5c` für die Farbe.

- [ ] **Step 5: Tests und Typecheck grün**

Run: `bunx vitest run packages/validation/src/board.spec.ts && bunx turbo typecheck --filter=@homarr/validation --filter=@homarr/api --filter=@homarr/db`
Expected: alle grün.

- [ ] **Step 6: Commit**

```bash
git add packages/db packages/validation/src/board.ts packages/validation/src/board.spec.ts packages/api/src/router/board.ts packages/translation/src/lang/en.json packages/translation/src/lang/de.json
git commit -m "feat: add idle weather location and clock color settings"
```

---

### Task 2: Preview-Context und Timer-Integration

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/preview-context.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/use-idle-screen.ts:12-56`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx:85-101`
- Modify: `apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx:104-143`
- Test: `apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts`

**Interfaces:**
- Consumes: `useIdleScreen({ enabled, timeoutMinutes })`.
- Produces: `IdleScreenPreviewProvider`, `useIdleScreenPreview(): { previewOpen: boolean; openPreview(): void; closePreview(): void }`, `isIdleScreenOpen({ previewOpen, timerOpen }): boolean`; `useIdleScreen` akzeptiert zusätzlich `paused?: boolean` (default `false`).

- [ ] **Step 1: Failing Test in `idle-screen.spec.ts`**

```ts
describe("idle screen open state", () => {
  it("opens for either the timer or the preview", () => {
    expect(isIdleScreenOpen({ previewOpen: true, timerOpen: false })).toBe(true);
    expect(isIdleScreenOpen({ previewOpen: false, timerOpen: true })).toBe(true);
    expect(isIdleScreenOpen({ previewOpen: false, timerOpen: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts`
Expected: FAIL – `isIdleScreenOpen` nicht exportiert.

- [ ] **Step 3: Context und Hilfsfunktion anlegen**

`preview-context.tsx` exportiert `isIdleScreenOpen`, den Provider mit `useState`-Flag und den Hook. `openPreview()` setzt `previewOpen = true`, `closePreview()` setzt es auf `false`.

- [ ] **Step 4: Timer pausieren und Overlay öffnen**

`useIdleScreen` bekommt `paused?: boolean`; wenn `paused`, werden keine Aktivitäts-Listener registriert und der Timer nicht neu gestartet. In `IdleScreen`: `const { previewOpen, closePreview } = useIdleScreenPreview()`, `const timerOpen = useIdleScreen({ ..., paused: previewOpen })`, `const open = isIdleScreenOpen({ previewOpen, timerOpen })`. `open` bleibt die Bedingung für Wake Lock und early return. Den Provider in `_layout-creator.tsx` um `BoardProviders`-Inhalt legen, damit Einstellungsseite und Board-Seite ihn teilen.

- [ ] **Step 5: Tests, Typecheck, Lint**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts && bunx turbo typecheck --filter=@homarr/nextjs && bunx oxlint apps/nextjs/src/components/board/idle-screen apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx`
Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add apps/nextjs/src/components/board/idle-screen apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx
git commit -m "feat: add AOD preview context independent of idle timer"
```

---

### Task 3: Karussell-Navigation

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/carousel.ts`
- Create: `apps/nextjs/src/components/board/idle-screen/idle-carousel.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx:101-142`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.module.css`
- Test: `apps/nextjs/src/components/board/idle-screen/carousel.spec.ts`

**Interfaces:**
- Consumes: `NowPlaying`, `AnalogClock`, `IdleWidgets`, `isIdleScreenOpen`.
- Produces: `type IdleLayer = "music" | "clock" | "widgets"`, `const idleLayerOrder: readonly IdleLayer[] = ["music", "clock", "widgets"]`, `getIdleLayerTarget(current: IdleLayer, delta: -1 | 1): IdleLayer` (geklemmt, kein Wrap), `classifyIdlePointer(dx: number, dy: number, threshold = 48): -1 | 1 | null`, `IdleCarousel({ initialLayer, musicPane, clockPane, widgetsPane, onClose })`.

- [ ] **Step 1: Failing Tests in `carousel.spec.ts`**

```ts
it("moves left to music and right to widgets from the clock", () => {
  expect(getIdleLayerTarget("clock", -1)).toBe("music");
  expect(getIdleLayerTarget("clock", 1)).toBe("widgets");
});

it("clamps at both ends instead of wrapping", () => {
  expect(getIdleLayerTarget("music", -1)).toBe("music");
  expect(getIdleLayerTarget("widgets", 1)).toBe("widgets");
});

it("treats short or mostly vertical pointer movement as a tap", () => {
  expect(classifyIdlePointer(20, 0)).toBeNull();
  expect(classifyIdlePointer(10, 80)).toBeNull();
  expect(classifyIdlePointer(-90, 10)).toBe(-1);
  expect(classifyIdlePointer(90, -10)).toBe(1);
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/carousel.spec.ts`
Expected: FAIL – Module fehlt.

- [ ] **Step 3: Reine Navigation implementieren**

`carousel.ts` mit `idleLayerOrder`, `getIdleLayerTarget` (Index + delta, geklemmt auf 0..2) und `classifyIdlePointer` (`Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : null`).

- [ ] **Step 4: Komponente und Verdrahtung**

`IdleCarousel` hält `useState<IdleLayer>(initialLayer)`, registriert `onPointerDown`/`onPointerUp` und `keydown` (ArrowLeft/ArrowRight/Escape → `onClose`), rendert die aktive Ebene in einem `div` mit `data-idle-layer` und einer CSS-Transition. In `idle-screen.tsx`: `initialLayer = "clock"`, Musik-Ebene = bestehender `MusicIdleScreen`-Aufruf, Uhr-Ebene = `IdleClockSurface` (Task 4), Widget-Ebene = `IdleWidgets`. Die bisherige `view`-Verzweigung aus `decideIdleView` entfällt im AOD; `decideIdleView` bleibt unverändert für andere Aufrufer erhalten.

- [ ] **Step 5: Tests und Typecheck**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/ && bunx turbo typecheck --filter=@homarr/nextjs`
Expected: grün. Hinweis: falls Task 4 noch nicht landet, `IdleClockSurface` vorläufig durch `<AnalogClock showSeconds={…} />` ersetzen und in Task 4 austauschen.

- [ ] **Step 6: Commit**

```bash
git add apps/nextjs/src/components/board/idle-screen
git commit -m "feat: add swipeable three-layer AOD carousel"
```

---

### Task 4: Uhr mit Wetter und gefrostetem Hintergrund

**Files:**
- Modify: `packages/widgets/package.json` (neuer Export `./weather-icon`)
- Create: `apps/nextjs/src/components/board/idle-screen/idle-clock-surface.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.module.css`
- Test: `apps/nextjs/src/components/board/idle-screen/idle-clock-surface.spec.ts`

**Interfaces:**
- Consumes: `clientApi.widget.weather.atLocation`, `WeatherIcon` aus `@homarr/widgets/weather-icon`, `AnalogClock`, `Board` aus `@homarr/boards/layout-data`.
- Produces: `getIdleWeatherInput(board: Board, settings: { idleScreenWeatherLocation: { latitude: number; longitude: number } | null }): { latitude: number; longitude: number } | null`, `IdleClockSurface({ board, settings })`.

- [ ] **Step 1: Failing Tests**

```ts
const board = { items: [] } as unknown as Board;
const boardWithWeatherWidget = {
  items: [{ kind: "weather", options: { location: { latitude: 48.85, longitude: 2.35 } } }],
} as unknown as Board;

it("uses the configured idle weather location", () => {
  expect(getIdleWeatherInput(board, { idleScreenWeatherLocation: { name: "B", latitude: 46.9, longitude: 7.4 } }))
    .toEqual({ latitude: 46.9, longitude: 7.4 });
});

it("falls back to the first weather/clock widget location and tolerates none", () => {
  expect(getIdleWeatherInput(boardWithWeatherWidget, { idleScreenWeatherLocation: null }))
    .toEqual({ latitude: 48.85, longitude: 2.35 });
  expect(getIdleWeatherInput(board, { idleScreenWeatherLocation: null })).toBeNull();
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-clock-surface.spec.ts`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Hilfsfunktion implementieren**

Die konfigurierte Position hat Vorrang; sonst die `options.location` des ersten Items mit `kind === "weather"` oder `kind === "clock"` (mit `latitude`/`longitude` als Zahlen); sonst `null`.

- [ ] **Step 4: Oberfläche bauen**

`packages/widgets/package.json`: `"./weather-icon": "./src/weather/icon.tsx"` in `exports` ergänzen. `IdleClockSurface` ruft `clientApi.widget.weather.atLocation.useQuery(input, { enabled: input !== null })`; bei Daten rendert sie `<WeatherIcon code={weather.current.weatherCode} isDay={weather.current.isDay} size={44} />` plus `weather.current.temperature.toFixed(1) + "°C"` neben/über `<AnalogClock showSeconds={settings.idleScreenShowClockSeconds} />`. Bei `null`/Ladezustand bleibt die Uhr allein sichtbar. CSS: `.clockSurface` mit `background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--idle-clock-color) 18%, #050506), #050506 62%)`, `backdrop-filter: blur(…)` auf einer dünnen Overlay-Schicht; keine hellen Flächen.

- [ ] **Step 5: Tests, Typecheck, Format**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-clock-surface.spec.ts && bunx turbo typecheck --filter=@homarr/widgets --filter=@homarr/nextjs && bunx oxfmt packages/widgets/package.json apps/nextjs/src/components/board/idle-screen/idle-screen.module.css`
Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add packages/widgets/package.json apps/nextjs/src/components/board/idle-screen
git commit -m "feat: show weather and frosted background on AOD clock"
```

---

### Task 5: Musik-Ebene mit animiertem Cover-Hintergrund

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.module.css`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx`
- Test: `apps/nextjs/src/components/board/idle-screen/music-pane.spec.ts`

**Interfaces:**
- Consumes: `NowPlaying`, `useNowPlaying`, `SmartHomeEntity`.
- Produces: `type MusicPaneState = "not-configured" | "no-track" | "ready"`, `getMusicPaneState({ integrationId: string | null, entityId: string | null, entity: { state?: string; attributes?: { mediaTitle?: string } } | null, hasArtwork: boolean }): MusicPaneState`, `MusicPane({ integrationId, entityId, showClockSeconds, showLyrics })`.

- [ ] **Step 1: Failing Tests**

```ts
it("reports missing configuration, an idle track and a ready track", () => {
  expect(getMusicPaneState({ integrationId: null, entityId: null, entity: null, hasArtwork: false })).toBe("not-configured");
  expect(getMusicPaneState({ integrationId: "ha", entityId: "media_player.x", entity: { state: "idle" }, hasArtwork: false })).toBe("no-track");
  expect(getMusicPaneState({ integrationId: "ha", entityId: "media_player.x", entity: { state: "playing" }, hasArtwork: true })).toBe("ready");
  expect(getMusicPaneState({ integrationId: "ha", entityId: "media_player.x", entity: { state: "playing" }, hasArtwork: false })).toBe("ready");
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/music-pane.spec.ts`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Zustand implementieren**

`not-configured`, wenn Integration oder Entity fehlt; `no-track`, wenn `entity` fehlt oder weder `mediaTitle` noch `state === "playing"`; sonst `ready`. `hasArtwork` wird nur für die Backdrop-Entscheidung genutzt, nicht für den Zustand.

- [ ] **Step 4: Pane und Animation**

`MusicPane` ruft `useNowPlaying` wie das bisherige `MusicIdleScreen`; bei `not-configured`/`no-track` rendert sie einen kurzen Hinweis in der Mitte (neue Keys `board.idleScreen.music.notConfigured` / `.nothingPlaying` in en/de), sonst `<NowPlaying entity={entity} showLyrics={showLyrics} />`. CSS: `.musicBackdrop` bekommt `@keyframes idleArtworkDrift` mit behutsamem `scale(1.05) → scale(1.11)` und leichtem `translate3d`, Dauer 24 s, `alternate`, `infinite`; unter `@media (prefers-reduced-motion: reduce)` `animation: none`. In `idle-screen.tsx` die Musik-Ebene von `MusicIdleScreen` auf `MusicPane` umstellen; `MusicIdleScreen` und seine `decideIdleView`-Nutzung bleiben unverändert im Projekt erhalten.

- [ ] **Step 5: Tests, Typecheck, Lint**

Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/ && bunx turbo typecheck --filter=@homarr/nextjs && bunx oxlint apps/nextjs/src/components/board/idle-screen`
Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add apps/nextjs/src/components/board/idle-screen packages/translation/src/lang/en.json packages/translation/src/lang/de.json
git commit -m "feat: animate AOD music backdrop and handle idle tracks"
```

---

### Task 6: Einstellungs-UI und Verdrahtung

**Files:**
- Create: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.tsx`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx:106-160`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_settings-form.tsx:60-95`, `:196-220`
- Test: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts`

**Interfaces:**
- Consumes: `useIdleScreenPreview().openPreview`, `clientApi.location.searchCity`, `boardSavePartialSettingsSchema`, `ColorInput` aus Mantine.
- Produces: `toIdleWeatherLocation(city: { name: string; latitude: number; longitude: number }): { name: string; latitude: number; longitude: number }`, `IdlePreviewSettings({ form, board })`.

- [ ] **Step 1: Failing Test**

```ts
it("maps a city search result to the stored idle weather location", () => {
  expect(toIdleWeatherLocation({ id: 1, name: "Bern", country: "CH", latitude: 46.95, longitude: 7.45, population: 100 }))
    .toEqual({ name: "Bern", latitude: 46.95, longitude: 7.45 });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bunx vitest run apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Hilfsfunktion und UI bauen**

`_idle-preview-settings.tsx` enthält `toIdleWeatherLocation`, einen Standort-Picker (TextInput + `clientApi.location.searchCity.useQuery`-Ergebnisliste, Auswahl schreibt `idleScreenWeatherLocation` via `form.setFieldValue`), eine `ColorInput` für `idleScreenClockColor` (Default `#1b3a5c`) und einen Button „AOD-Vorschau" (`onClick={openPreview}`, `type="button"`). Der Button liegt außerhalb des `{enabled && …}`-Blocks und ist auch bei ausgeschaltetem AOD sichtbar. In `_behavior.tsx` die Select für `idleScreenMode` entfernen und `<IdlePreviewSettings form={form} board={board} />` innerhalb der Idle-Screen-Sektion einhängen. In `_settings-form.tsx` `idleScreenWeatherLocation` und `idleScreenClockColor` zu `PARTIAL_FORM_KEYS` und `buildInitialValues` hinzufügen.

- [ ] **Step 4: Tests, Typecheck, Lint/Format**

Run: `bunx vitest run apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts && bunx turbo typecheck --filter=@homarr/nextjs && bunx oxfmt apps/nextjs/src/app/[locale]/boards/[name]/settings`
Expected: grün.

- [ ] **Step 5: Live-Check (Task 6 abschließend)**

Mit `DEMO_MODE`-Setup aus AGENTS.md: Server starten, Einstellungen öffnen, Standort und Uhr-Farbe setzen, speichern, „AOD-Vorschau" klicken. Erwartung: Overlay öffnet sofort und bleibt offen; Mitte zeigt Uhr mit Wetter; Pfeiltasten/Wisch wechseln links Musik und rechts Widget-Layout; Esc schließt; auf dem normalen Board erscheint weiterhin das Dashboard.

- [ ] **Step 6: Commit**

```bash
git add apps/nextjs/src/app/[locale]/boards/[name]/settings
git commit -m "feat: add AOD preview, weather location and clock color to settings"
```
