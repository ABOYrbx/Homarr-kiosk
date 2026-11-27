# AOD-Widget-Skala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Board-Setting `idleScreenWidgetScale` als Slider (50–200 %) ergänzen, das die Skala der AOD-Widget-Ebene multipliziert und beim Vergrößern ein Verschieben der Fläche erlaubt.

**Architecture:** Neue additive Zahlenspalte auf `board` mit Default 1, durchgereicht durch Drizzle-Schema, Zod-Schemas, tRPC `getBoardSettings`/`savePartialBoardSettings` und die bestehenden Board-Konstruktionsstellen. Der Slider sitzt in der vorhandenen AOD-Settings-Komponente; `IdleWidgets` liest den gespeicherten Wert aus dem Live-Board und wendet ihn auf die Autofit-Skala an. Pointer-basiertes Panning innerhalb der Kartenfläche hält vergrößerte Karten erreichbar, ohne das Ebenen-Wischen vom Hintergrund zu stören.

**Tech Stack:** Next.js 16 App Router, Mantine `Slider`, `@tabler/icons-react`, tRPC, Drizzle (SQLite `real` / PostgreSQL `doublePrecision`), Zod v4, Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-11-27-aod-widget-scale-design.md`

## Global Constraints

- Mantine + `@tabler/icons-react`, kein Tailwind außerhalb der Docs-App. Lint oxlint, Format oxfmt.
- Kein Upstream-PR, kein Push, keine Custom-Widget-Sandbox-Lockerung.
- Keine Änderung an UV/DPMS, `requestFullscreen`, Idle-Timer, Musik-/Lyrics-Pfad, Layout-Rollen oder normaler Board-Darstellung.
- Keine breiten Test-/E2E-Suites; nur fokussierte Vitest-Tests, gezielte Typechecks und ein Live-Check.
- Migrationen additiv: `DEFAULT 1 NOT NULL`, keine destruktive Änderung. SQLite wird 0058, PostgreSQL 0027.
- Neue UI-Texte in `packages/translation/src/lang/en.json` und `de.json` unter `board.field.idleScreenWidgetScale`.
- Der Slider schreibt in den Form-State; die Vorschau übernimmt den Wert erst nach Save (bestehendes Muster bei `idleScreenClockColor`).

## Review Focus

- **Gespeicherter Wert fehlt oder ist `null` in einem älteren Board** → Task 1 testet den Default in `boardSettingsSchema` und Task 3 liest mit `?? 1`.
- **Wert außerhalb 0,5–2 (z. B. manipulierte DB oder API)** → Task 1 testet `boardSavePartialSettingsSchema` mit `0.4` und `2.1` (ablehnen), Task 3 clamp zusätzlich.
- **Vergrößerung über den Viewport hinaus** → Task 3 hält die Karten per Panning erreichbar und clampt den Versatz an den layoutspezifischen Rand.
- **Wischen vom Hintergrund oder Tippen zum Schließen darf durch das Panning nicht verschluckt werden** → Task 3 startet Panning nur inside `[data-idle-widget-slot]`; Live-Check prüft beide Gesten.
- **Vorschau zeigt veralteten Wert** → Task 2 verlässt sich auf den `getBoardByName`-Refetch nach Save; Live-Check prüft Slider → Save → Vorschau ohne Reload.

---

### Task 1: Datenmodell, Validierung, Router, i18n und Migrationen

**Files:**
- Modify: `packages/db/schema/sqlite.ts:301-306`, `packages/db/schema/postgresql.ts:316-321`
- Modify: `packages/validation/src/board.ts:93-108`
- Modify: `packages/validation/src/board.spec.ts:62-89`
- Modify: `packages/api/src/router/board.ts:1238`, `:1275`, `:1760`, `:1806`
- Modify: `packages/api/src/router/onboard/onboard-router.ts:423-424`
- Modify: `packages/translation/src/lang/en.json:7081`, `de.json:7081`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_settings-form.tsx:71-72`, `:99-100`
- Modify: `apps/nextjs/src/components/assistant/assistant-board-settings-tool.tsx:94-95`
- Modify: `apps/nextjs/src/components/board/items/actions/test/mocks/board-mock.ts:39-40`
- Modify: `apps/nextjs/src/components/layout/header/header-widget-runtime-boundary.tsx:42-43`
- Generated: `packages/db/migrations/sqlite/0058_*` + `meta/`, `packages/db/migrations/postgresql/0027_*` + `meta/`

**Interfaces:**
- Consumes: `hexColorSchema`, `boardSavePartialSettingsSchema`, `boardSettingsSchema`, bestehende Board-Konstruktionsstellen.
- Produces: `idleScreenWidgetScale: number` (Default `1`, Bereich 0.5–2) auf `Board`, `getBoardSettings` und `savePartialBoardSettings`; i18n-Keys `board.field.idleScreenWidgetScale.{label,description}`.

- [ ] **Step 1: Failing Tests in `packages/validation/src/board.spec.ts`**

```ts
it("parses the idle widget scale with its default", () => {
  expect(boardSavePartialSettingsSchema.parse({ idleScreenWidgetScale: 1.35 })).toMatchObject({
    idleScreenWidgetScale: 1.35,
  });
  expect(boardSettingsSchema.shape.idleScreenWidgetScale.parse(undefined)).toBe(1);
});

it("rejects idle widget scales outside 0.5 to 2", () => {
  expect(() => boardSavePartialSettingsSchema.parse({ idleScreenWidgetScale: 0.4 })).toThrow();
  expect(() => boardSavePartialSettingsSchema.parse({ idleScreenWidgetScale: 2.1 })).toThrow();
});
```

- [ ] **Step 2: Tests laufen lassen**
Run: `bunx vitest run packages/validation/src/board.spec.ts`
Expected: FAIL – `idleScreenWidgetScale` unbekannt.

- [ ] **Step 3: Schemas, DB-Spalten, Router und Texte ergänzen**
`idleScreenWidgetScale: z.number().min(0.5).max(2)` in `boardSavePartialSettingsSchema`; `z.number().min(0.5).max(2).default(1)` in `boardSettingsSchema`. DB: `real().default(1).notNull()` (SQLite) und `doublePrecision().default(1).notNull()` (Postgres). Router: Spalte in `getBoardSettings` (`:1275`) und `.set()` (`:1806`), beide MCP-Beschreibungen ergänzen. Alle vier Board-Konstruktionsstellen und `PARTIAL_FORM_KEYS`/`buildInitialValues` um das Feld erweitern (Fallback `?? 1`). Texte en/de ergänzen (en: "AOD widget scale" / "Scale the widget layer in the idle screen"; de: "AOD-Widget-Skala" / "Skaliert die Widget-Ebene im Leerlaufbildschirm").

- [ ] **Step 4: Migrationen generieren**
Run: `bun run db:migration:sqlite:generate && bun run db:migration:postgresql:generate`
Expected: `0058_*` mit `ALTER TABLE \`board\` ADD \`idle_screen_widget_scale\` real DEFAULT 1 NOT NULL;` und `0027_*` mit `ALTER TABLE "board" ADD COLUMN "idle_screen_widget_scale" double precision DEFAULT 1 NOT NULL;`; Snapshots und Journale aktualisiert.

- [ ] **Step 5: Tests und Typecheck grün**
Run: `bunx vitest run packages/validation/src/board.spec.ts && bunx turbo typecheck --filter=@homarr/validation --filter=@homarr/api --filter=@homarr/db`
Expected: grün.

- [ ] **Step 6: Commit** – `feat: add AOD widget scale board setting`

---

### Task 2: Slider in den Board-Einstellungen

**Files:**
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.tsx:148-175`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts`

**Interfaces:**
- Consumes: `idleScreenWidgetScale: number` aus `FormValues`/`Board` (Task 1), `useIdleScreenPreview`, `useI18n("board")`.
- Produces: Slider im AOD-Settings-Block, der `form.setFieldValue("idleScreenWidgetScale", value)` aufruft.

- [ ] **Step 1: Failing Test im vorhandenen Spec**
Test, dass `formatWidgetScale(1.35) === "135 %"` und `formatWidgetScale(1) === "100 %"` (neue, kleine Hilfsfunktion in `_idle-preview-settings.tsx` exportieren). Run: `bunx vitest run apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts` – Expected: FAIL, `formatWidgetScale` fehlt.

- [ ] **Step 2: Slider einbauen**
`Input.Wrapper` mit `label={t("field.idleScreenWidgetScale.label")}` und `description`, darin Mantine `<Slider min={0.5} max={2} step={0.05} marks={[{value:0.5,label:"50 %"},{value:1,label:"100 %"},{value:2,label:"200 %"}]} value={form.values.idleScreenWidgetScale ?? board.idleScreenWidgetScale ?? 1} onChange={(value) => form.setFieldValue("idleScreenWidgetScale", value)} />`. Platzierung direkt vor dem Preview-Button-Block. `formatWidgetScale` als `export const formatWidgetScale = (value: number) => `${Math.round(value * 100)} %`;` implementieren und als `thumbLabel` verwenden.

- [ ] **Step 3: Tests, Typecheck, Lint**
Run: `bunx vitest run apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-preview-settings.spec.ts && bunx turbo typecheck --filter=@homarr/nextjs && bunx oxlint "apps/nextjs/src/app/[locale]/boards/[name]/settings"`
Expected: grün.

- [ ] **Step 4: Commit** – `feat: add AOD widget scale slider to board settings`

---

### Task 3: Skalierung und Panning in der Widget-Ebene

**Files:**
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-widgets.tsx:19-84`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.module.css:55-85`
- Test: `apps/nextjs/src/components/board/idle-screen/idle-widgets.spec.ts` (neu)

**Interfaces:**
- Consumes: `board.idleScreenWidgetScale` aus `useOptionalBoard()` (Task 1), `resolveIdleItems`, `getLogicalGridSize`.
- Produces: `getIdleWidgetScale({ fitScale, userScale }): number` (clamp 0.2–2), `clampIdlePan({ offset, scaledSize, viewportSize, padding }): number`; `IdleWidgets` wendet `transform: translate(...) scale(...)` an.

- [ ] **Step 1: Failing Tests**
```ts
expect(getIdleWidgetScale({ fitScale: 0.8, userScale: 1.5 })).toBeCloseTo(1.2);
expect(getIdleWidgetScale({ fitScale: 0.8, userScale: 99 })).toBe(2);
expect(clampIdlePan({ offset: 500, scaledSize: 2000, viewportSize: 1000, padding: 32 })).toBe(500);
expect(clampIdlePan({ offset: 500, scaledSize: 1100, viewportSize: 1000, padding: 32 })).toBe(82);
```
Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-widgets.spec.ts` – Expected: FAIL.

- [ ] **Step 2: Hilfsfunktionen implementieren**
`getIdleWidgetScale` multipliziert `fitScale * userScale`, clamp auf 0.2–2. `clampIdlePan` begrenzt den Versatz auf `Math.max(0, (scaledSize - (viewportSize - 2 * padding)) / 2)`.

- [ ] **Step 3: Skala und Panning anwenden**
In `IdleWidgets`: `const userScale = board.idleScreenWidgetScale ?? 1;`, `scale = getIdleWidgetScale({ fitScale, userScale })`. Ref für Pointer-Start; `onPointerDown` nur starten, wenn `event.target.closest("[data-idle-widget-slot]")` – damit Wischen/Tippen vom Hintergrund unberührt bleibt. `onPointerMove` verschiebt, `onPointerUp`/`onPointerCancel` beenden; Versatz mit `clampIdlePan` je Achse begrenzen. `style.transform = translate(${pan.x}px, ${pan.y}px) scale(${scale})`. Bei Skalen-/Viewport-Änderung Versatz zurücksetzen. CSS: `.widgets { touch-action: none; }`, `.widgetsFrame { overflow: hidden; }` (Panning rein über Pointer, keine nativen Scrollbars).

- [ ] **Step 4: Tests, Typecheck, Lint**
Run: `bunx vitest run apps/nextjs/src/components/board/idle-screen/idle-widgets.spec.ts && bunx turbo typecheck --filter=@homarr/nextjs && bunx oxlint apps/nextjs/src/components/board/idle-screen`
Expected: grün.

- [ ] **Step 5: Commit** – `feat: scale and pan the AOD widget layer`

---

### Task 4: Live-Check und Abschluss

**Files:** keine product files; Screenshots unter `.openchamber/screenshots/`.

- [ ] **Step 1: Migration auf die lokale Demo-DB anwenden**
Run: `bun run db:migration:sqlite:run` (mit vorhandenem gitignoriertem `.env`).
Expected: neue Spalte `idle_screen_widget_scale` mit Default 1.

- [ ] **Step 2: Slider im Browser prüfen**
Board-Einstellungen öffnen, Wert auf 150 % setzen, Save, AOD-Vorschau öffnen, auf Widget-Ebene wechseln und prüfen: Karten größer, Panning per Drag möglich, Wischen vom Hintergrund wechselt Ebene, Tap schließt.

- [ ] **Step 3: Aufräumen**
Temporäre Start-Ebenen-Umstellung zurücksetzen, Browser-Tabs schließen, `git status` prüfen. Kein Push, kein PR.
