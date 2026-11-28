# Vereinheitlichte AOD-Musikquelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vier AOD-Musikfelder werden zu einem Block mit HA/MA-Quellen, festem Player oder Auto-Erkennung mit Ein-/Ausschlussliste; MA liefert komplettes Now-Playing inklusive Steuerung.

**Architecture:** Vier additive Board-Felder steuern Auswahl und Filter; die bestehenden vier Felder bleiben unverändert. Ein normalisierter `MusicTrack` wird von HA- und MA-Adaptern gefüllt und von `NowPlaying` unabhängig von der Quelle gerendert. Die Auto-Auswahl läuft als Hook nur bei geöffnetem Overlay und wählt aus den erlaubten spielenden Playern.

**Tech Stack:** Next.js/Mantine, tRPC, Drizzle (SQLite + PostgreSQL), Zod, Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-11-28-aod-music-sources-design.md`

## Global Constraints

- Kein Upstream-PR, kein Push.
- Mantine + `@tabler/icons-react`; oxlint (nicht ESLint) und oxfmt (nicht Prettier).
- Additive Migrationen; bestehende Boards behalten `fixed` mit HA-Priorität ohne Datenverlust.
- Keine Änderung an UV/DPMS, `requestFullscreen`, Idle-Timer, `usePlaybackClock`, `computePlaybackPosition`, Lyrics-Zeitlogik, Widget-/Uhr-Ebene oder Layout-Rollen.
- Keine Custom-Widget-Sandbox-Lockerung, keine neuen Abhängigkeiten, keine breiten Test-/E2E-Suites.
- MA-Zeitstempel `elapsed_time_last_updated` sind **Unix-Sekunden** → für die Clock in ms umrechnen.
- Player-ID-Präfix `ha:<integrationId>:<entityId>` / `ma:<integrationId>:<queueId>`; beim Parsen nur die ersten beiden Doppelpunkte trennen (MA-Queue-IDs können selbst Doppelpunkte enthalten).

## Review Focus

1. Bestehendes Board ohne neue Felder: muss weiterhin `fixed` mit HA-Entity und MA-Queue wie vorher rendern. → Task 1 Migration/Default-Test.
2. Quelle abhaken darf gespeicherte Integration/Entity/Queue nicht löschen. → Task 7 Settings-Test (Checkbox ändert nur `idleScreenMusicSources`).
3. Fünf spielende Player, Filter `exclude` mit zwei angehakten Alexas → nur die anderen drei sind Kandidaten. → Task 3 `filterMusicTracks`-Test.
4. MA-Queue ohne `current_item` oder mit `state: idle` → kein Track-Blitz, Karussell bleibt auf der Uhr. → Task 2 Normalisierungs- und Task 6 Auswahl-Test.
5. Zwei HA-Integrationen mit gleicher Entity-ID → Präfix mit Integrations-ID hält sie auseinander. → Task 3 `pickPlayingTrack`-Test mit vollen IDs.

---

### Task 1: Board-Felder, Migration, API und Defaults

**Files:**
- Modify: `packages/db/schema/sqlite.ts:300-311`, `packages/db/schema/postgresql.ts:316-327`
- Create: `packages/db/migrations/sqlite/0062_*.sql`, `packages/db/migrations/postgresql/0031_*.sql` (per Generate-Skript)
- Modify: `packages/validation/src/board.ts:63-108`
- Modify: `packages/api/src/router/board.ts:1266-1282`, `packages/api/src/router/board.ts:1766`, `packages/api/src/router/board.ts:1802-1818`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_settings-form.tsx:63-112`
- Modify: `apps/nextjs/src/components/layout/header/header-widget-runtime-boundary.tsx:38-44`
- Modify: `apps/nextjs/src/components/board/items/actions/test/mocks/board-mock.ts:35-41`
- Modify: `packages/api/src/router/onboard/onboard-router.ts:419-425`
- Modify: `apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx:127-133`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx:25-37`
- Modify: `packages/translation/src/lang/en.json:7060-7089`, `packages/translation/src/lang/de.json:7060-7089`
- Test: `packages/validation/src/board.spec.ts` (oder bestehender Board-Schema-Test)

**Interfaces:**
- Produces: `idleScreenMusicSources: string[]`, `idleScreenMusicSelectionMode: "fixed" | "auto"`, `idleScreenMusicPlayerFilterMode: "include" | "exclude"`, `idleScreenMusicPlayerIds: string[]` auf `FormValues`, `IdleScreenSettings` und im Board-Router-Output.

- [ ] **Step 1: Schemas und Router erweitern**

In beiden DB-Schemas nach `idleScreenMusicAssistantQueueId` vier Spalten ergänzen: `idleScreenMusicSources` (text, default `'[]'`, notNull), `idleScreenMusicSelectionMode` (text `$type<"fixed" | "auto">()`, default `'fixed'`, notNull), `idleScreenMusicPlayerFilterMode` (text `$type<"include" | "exclude">()`, default `'exclude'`, notNull), `idleScreenMusicPlayerIds` (text, default `'[]'`, notNull). In `boardSavePartialSettingsSchema` analoge Zod-Felder ergänzen: `z.array(z.enum(["homeAssistant", "musicAssistant"]))`, `z.enum(["fixed", "auto"])`, `z.enum(["include", "exclude"])`, `z.array(z.string().regex(/^(ha|ma):[^:]+:.+$/)).max(200)`. In `board.ts` die vier Felder in `getBoardSettings`-Selection, im MCP-Description-Text und im `updateBoardSettings`-`.set()` ergänzen.

- [ ] **Step 2: Migrationen erzeugen und Backfill ergänzen**

Run: `bun run db:migration:sqlite:generate && bun run db:migration:postgresql:generate`
In den generierten SQL-Dateien nach den `ALTER TABLE`-Statements je ein `UPDATE board SET ...` ergänzen, das `idle_screen_music_sources` aus den alten Spalten befüllt: `["homeAssistant"]` wenn `idle_screen_home_assistant_integration_id` und `idle_screen_media_player_entity_id` nicht null, `["musicAssistant"]` wenn `idle_screen_music_assistant_integration_id` und `idle_screen_music_assistant_queue_id` nicht null, sonst `[]` (SQLite: `CASE` mit JSON-Literal-Strings; Postgres: analog mit `::jsonb`).

- [ ] **Step 3: Failing Test schreiben**

Test in `packages/validation/src/board.spec.ts`: `boardSavePartialSettingsSchema.parse({ idleScreenMusicSelectionMode: "auto", idleScreenMusicPlayerFilterMode: "include", idleScreenMusicSources: ["homeAssistant", "musicAssistant"], idleScreenMusicPlayerIds: ["ha:abc:media_player.kueche", "ma:abc:b8:27:eb:8a:b8:8e"] })` gibt die Werte unverändert zurück; ein Wert `"bogus"` bei `idleScreenMusicSelectionMode` und eine ID ohne Präfix schlagen fehl.

- [ ] **Step 4: Test rot/grün und Defaults verdrahten**

Run: `bun test packages/validation/src/board.spec.ts` → zuerst FAIL, dann PASS. Danach die vier Felder in `_settings-form.tsx` (Keys und `createForm`-Defaults), `header-widget-runtime-boundary.tsx`, `board-mock.ts`, `onboard-router.ts`, `_layout-creator.tsx` und `IdleScreenSettings` ergänzen. Defaults: `[]`, `"fixed"`, `"exclude"`, `[]`; beim Lesen `??` auf die Defaults anwenden.

- [ ] **Step 5: i18n und Typecheck**

Neue Keys unter `board.field`: `idleScreenMusicSources` (label/description), `idleScreenMusicSelectionMode` (label/description/fixed/auto), `idleScreenMusicPlayerFilterMode` (label/description/include/exclude), `idleScreenMusicPlayerIds` (label/description/none). en und de mit identischem Key-Set.
Run: `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/api --filter=@homarr/validation --filter=@homarr/db` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db packages/validation packages/api apps/nextjs docs/superpowers
git commit -m "feat: add unified AOD music source board fields"
```

---

### Task 2: Music Assistant Now-Playing und Steuerung

**Files:**
- Modify: `packages/integrations/src/music-assistant/music-assistant-queue.ts`
- Modify: `packages/integrations/src/music-assistant/music-assistant-integration.ts`
- Modify: `packages/request-handler/src/music-assistant.ts`
- Modify: `packages/api/src/router/music-assistant.ts`
- Test: `packages/integrations/src/music-assistant/music-assistant-queue.spec.ts`

**Interfaces:**
- Consumes: `MusicAssistantConnection.sendAsync(command, args)` aus Task-1-Bestand.
- Produces: `QueueInfo` mit `state: "playing" | "paused" | "idle"`, `active: boolean`, `elapsedTime?: number`, `elapsedTimeLastUpdated?: number` (Sekunden), `currentIndex?: number`, `currentItem?: QueueTrack & { artworkUrl?: string }`; `MusicAssistantNowPlaying = { queueId: string; name: string; state: "playing" | "paused" | "idle"; elapsedTime?: number; elapsedTimeLastUpdated?: number; currentIndex?: number; track?: QueueTrack & { artworkUrl?: string } }`; `normalizeNowPlaying(envelope, queueId)` → `MusicAssistantNowPlaying`; `getNowPlayingAsync()` → `MusicAssistantNowPlaying[]`; `controlAsync(queueId, action, positionSeconds?)`; tRPC `musicAssistant.nowPlaying` mit Input `{ integrationId: string }` und `musicAssistant.control` mit Input `{ integrationId: string; queueId: string; action: "play_pause" | "next" | "previous" | "seek"; positionSeconds?: number }`.

- [ ] **Step 1: Failing Tests schreiben**

In `music-assistant-queue.spec.ts`: (a) `normalizeNowPlaying` liest aus `player_queues/all` `state: "playing"`, `elapsed_time: 12.5`, `elapsed_time_last_updated: 1700000000`, `current_index: 1` und `current_item.media_item.name: "Song"` → `state`, `elapsedTime`, `elapsedTimeLastUpdated`, `currentIndex`, `track.title` gesetzt; (b) Queue ohne `current_item` → `track` undefiniert, kein Throw; (c) `state: "idle"` → `state: "idle"`.

- [ ] **Step 2: Tests rot/grün**

Run: `bun test packages/integrations/src/music-assistant/music-assistant-queue.spec.ts` → FAIL, dann implementieren: `playerQueueSchema` um die neuen Felder erweitern (optional/tolerant), `QueueInfo` entsprechend, `normalizeQueues` mappt sie, `normalizeNowPlaying` wählt den Queue-Eintrag mit `queue_id === queueId` aus `player_queues/all`. Cover nur aus `current_item.image.path`, wenn es mit `http://`/`https://` beginnt; sonst weglassen.

- [ ] **Step 3: Integration, Handler und Prozeduren**

`getNowPlayingAsync()` ruft `player_queues/all` und gibt `normalizeNowPlaying` für alle Queues zurück. `controlAsync(queueId, action: "play_pause" | "next" | "previous" | "seek", positionSeconds?)` sendet `player_queues/play_pause` / `next` / `previous` mit `{ queue_id }` bzw. `player_queues/seek` mit `{ queue_id, position: positionSeconds }`. Request-Handler `musicAssistantNowPlayingRequestHandler` (cacheNamespace `music-assistant:now-playing`, ttl 5 s). In `music-assistant.ts`: `nowPlaying` als `protectedProcedure.concat(createOneIntegrationMiddleware("query", "musicAssistant"))` mit Input `{ integrationId: z.string() }` und Output-Array von `MusicAssistantNowPlaying`; `control` als `protectedProcedure.concat(createOneIntegrationMiddleware("interact", "musicAssistant"))` mit Input `{ integrationId: z.string(), queueId: z.string(), action: z.enum(["play_pause", "next", "previous", "seek"]), positionSeconds: z.number().nonnegative().optional() }`.

- [ ] **Step 4: Prüfen und committen**

Run: `bun test packages/integrations/src/music-assistant/music-assistant-queue.spec.ts && bun run turbo typecheck --filter=@homarr/integrations --filter=@homarr/api` → PASS.
```bash
git add packages/integrations packages/request-handler packages/api
git commit -m "feat: expose Music Assistant now-playing and controls"
```

---

### Task 3: Normalisierter MusicTrack und Filterlogik

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/music-track.ts`
- Create: `apps/nextjs/src/components/board/idle-screen/music-selection.ts`
- Test: `apps/nextjs/src/components/board/idle-screen/music-selection.spec.ts`

**Interfaces:**
- Consumes: `SmartHomeEntity` (`@homarr/integrations/types`), `MusicAssistantNowPlaying`/`QueueView` aus Task 2.
- Produces: `MusicTrack`, `fromSmartHomeEntity(entity, integrationId): MusicTrack | undefined`, `fromMusicAssistantNowPlaying(nowPlaying, integrationId): MusicTrack | undefined`, `filterMusicTracks(tracks, mode, ids): MusicTrack[]`, `pickPlayingTrack(tracks): MusicTrack | undefined`, `parsePlayerId(id): { source: "ha" | "ma"; integrationId: string; playerId: string } | undefined`.

- [ ] **Step 1: Failing Tests schreiben**

`music-selection.spec.ts`: (a) `include` mit `["ha:a:media_player.kueche", "ma:b:b8:27:eb:8a"]` lässt genau diese zwei durch; (b) `exclude` mit zwei Alexas lässt genau die anderen drei von fünf durch; (c) `pickPlayingTrack` wählt bei zwei `playing`-Tracks den mit größerem `positionUpdatedAt`; (d) kein `playing` → `undefined`; (e) `parsePlayerId("ma:b:b8:27:eb:8a")` → `{ source: "ma", integrationId: "b", playerId: "b8:27:eb:8a" }`.

- [ ] **Step 2: Implementieren und grün machen**

`MusicTrack` mit den Feldern aus der Spec (source, integrationId, playerId, playerName, title, artist?, album?, artworkUrl?, state, positionSeconds?, positionUpdatedAt?, durationSeconds?, mediaContentId?, queue?). Adapter lesen HA-Attribute bzw. MA-`elapsedTime`/`elapsedTimeLastUpdated * 1000`. `pickPlayingTrack` sortiert nur `state === "playing"` nach `positionUpdatedAt ?? 0` absteigend, bei Gleichstand HA vor MA.

Run: `bun test apps/nextjs/src/components/board/idle-screen/music-selection.spec.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/nextjs/src/components/board/idle-screen
git commit -m "feat: add normalized AOD music track and selection helpers"
```

---

### Task 4: NowPlaying auf MusicTrack umstellen

**Files:**
- Modify: `apps/nextjs/src/components/board/idle-screen/now-playing.tsx:50-299`
- Modify: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx:41-128`
- Test: bestehende `apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts` und `music-pane.spec.ts`

**Interfaces:**
- Consumes: `MusicTrack`, `fromSmartHomeEntity` aus Task 3.
- Produces: `NowPlaying` mit Prop `track: MusicTrack` statt `entity`, `onControl(action: "mediaPrevious" | "mediaPlayPause" | "mediaNext"): void`, `canControl: (action) => boolean`; unverändert `showLyrics`, `lyricsOffsetSeconds`, `queue`, `queueAvailable`.

- [ ] **Step 1: Signatur und Aufrufer umstellen**

`NowPlaying` nimmt `track` statt `entity` und `integrationId`/`entityId` nur noch für den HA-Control-Callback. Titel/Artist/Album/Cover/Duration/Position/State und `buildTrackKey` aus `MusicTrack` speisen (Track-Key aus `mediaContentId ?? title|artist|duration`). Die drei Player-Buttons rufen `onControl(...)` auf; `disabled` kommt aus `canControl(...)`; HA liefert `supportsSmartHomeAction`. Lyrics-, Queue-Toggle und `activeView` bleiben unverändert (inkl. Lyrics-Toggle aus `66fa97e3a`).

- [ ] **Step 2: MusicPane auf HA-Adapter umstellen**

`ConfiguredMusicPane` baut aus der `useNowPlaying`-Entity `fromSmartHomeEntity(entity, integrationId)` und übergibt `track`. `getMusicPaneState` bleibt als Helper; `MusicPaneState` unverändert.

- [ ] **Step 3: Prüfen und committen**

Run: `bun test apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts apps/nextjs/src/components/board/idle-screen/music-pane.spec.ts && bun run turbo typecheck --filter=@homarr/nextjs` → PASS.
```bash
git add apps/nextjs/src/components/board/idle-screen
git commit -m "refactor: render AOD now-playing from normalized track"
```

---

### Task 5: MA-Hooks, MusicPane-MA-Zweig und Steuerung

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/use-music-assistant-now-playing.ts`
- Modify: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/now-playing.tsx` (Control-Wiring)

**Interfaces:**
- Consumes: `clientApi.musicAssistant.nowPlaying/control`, `fromMusicAssistantNowPlaying` aus Task 3.
- Produces: `useMusicAssistantNowPlaying({ integrationId, queueId, enabled })` → `{ tracks: MusicTrack[] }`; MA-`onControl` ruft `musicAssistant.control` mit `queueId`.

- [ ] **Step 1: Hook schreiben**

`useMusicAssistantNowPlaying` nutzt `clientApi.musicAssistant.nowPlaying.useQuery({ integrationId }, { enabled, staleTime: 5000 })`. Die Prozedur akzeptiert `integrationId` im Input (Middleware braucht sie). Results werden mit `fromMusicAssistantNowPlaying` zu `MusicTrack[]` gemappt; `queueId` filtert bei Bedarf.

- [ ] **Step 2: MA-Zweig in MusicPane und Control-Wiring**

Wenn keine HA-Entity, aber MA-Integration + Queue gesetzt ist, rendert `MusicPane` aus dem MA-Track; `queueAvailable` wie heute aus Queue-Länge. `NowPlaying` bekommt `onControl` von HA oder MA; MA deaktiviert Aktionen, die die Integration nicht meldet. MA-Controls invalidieren nach Erfolg den `nowPlaying`-Cache.

- [ ] **Step 3: Prüfen und committen**

Run: `bun run turbo typecheck --filter=@homarr/nextjs && bunx oxfmt --check apps/nextjs/src/components/board/idle-screen` → PASS.
```bash
git add apps/nextjs/src/components/board/idle-screen
git commit -m "feat: drive AOD now-playing from Music Assistant"
```

---

### Task 6: Auto-Auswahl und Overlay-Verdrahtung

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/use-music-source.ts`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.tsx:70-229`
- Modify: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx`
- Test: `apps/nextjs/src/components/board/idle-screen/music-selection.spec.ts` (erweitert)

**Interfaces:**
- Consumes: alle Felder aus Task 1, `filterMusicTracks`/`pickPlayingTrack` aus Task 3, HA- und MA-Hooks aus Task 5.
- Produces: `useMusicSource(settings)` → `{ track: MusicTrack | undefined; isLoading: boolean }`, benutzt von `MusicPresence` (nur `initialLayer`) und `MusicPane`.

- [ ] **Step 1: Erweiterten Test schreiben**

Test: Kandidaten aus HA (2) + MA (3), Filter `exclude` mit einer MA-ID, `state` eines HA-Players `playing`, MA `playing` mit jüngerem Timestamp → MA gewinnt; alle `idle` → `undefined`.

- [ ] **Step 2: Hook implementieren**

`fixed`: HA-Track wenn HA-Entity gesetzt, sonst MA-Track; Queue bleibt wie heute zusätzlich sichtbar. `auto`: HA-Kandidaten aus `useSmartHomeSnapshot` mit `domains: ["media_player"]` (Filter über `entityIds`/`excludedEntityIds` je Modus, geparst mit `parsePlayerId`), MA-Kandidaten aus `useMusicAssistantNowPlaying`; `filterMusicTracks` dann `pickPlayingTrack`. Alle Abos nur bei geöffnetem Overlay.

- [ ] **Step 3: Verdrahten**

`MusicPresence` nutzt `useMusicSource` für `initialLayer` (`playing` → Musik, sonst Uhr), ändert aber nicht das Öffnen des Overlays. `MusicPane` nutzt denselben Track, damit Auto- und Fixed-Modus identisch rendern. `MusicIdleScreen` bleibt unangetastet.

- [ ] **Step 4: Prüfen und committen**

Run: `bun test apps/nextjs/src/components/board/idle-screen/music-selection.spec.ts && bun run turbo typecheck --filter=@homarr/nextjs` → PASS.
```bash
git add apps/nextjs/src/components/board/idle-screen
git commit -m "feat: auto-select the playing AOD music source"
```

---

### Task 7: Settings-Block

**Files:**
- Create: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_idle-music-sources.tsx`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx:54-276`
- Modify: `packages/translation/src/lang/{en,de}.json` (Feinschliff der Task-1-Keys)

**Interfaces:**
- Consumes: `FormValues` aus Task 1, `clientApi.integration.all`, `clientApi.widget.smartHome.searchCatalog`, `clientApi.musicAssistant.queues`.
- Produces: `IdleMusicSourcesSettings({ form })`; ersetzt die vier Selects in `IdleScreenSettingsContent`.

- [ ] **Step 1: Komponente schreiben**

Zwei Mantine-`Checkbox` für `idleScreenMusicSources` (kein Löschen der alten Felder), ein `SegmentedControl` für `idleScreenMusicSelectionMode`, ein `SegmentedControl` für `idleScreenMusicPlayerFilterMode`; die bestehenden HA-/MA-Integrations-`Select`s und festen Player-/Queue-`Select`s bleiben sichtbar (nur bei aktiver Quelle). Die Playerliste ist eine scrollbare Liste von `Checkbox` mit `ha:`/`ma:`-Präfix-IDs und Quellen-/Integrationsnamen; leer → Hinweis `idleScreenMusicPlayerIds.none`. `disabled`-Logik für abhängige Felder wie heute.

- [ ] **Step 2: In BehaviorSettings einbauen**

Die vier alten Select-Blöcke durch `<IdleMusicSourcesSettings form={form} />` ersetzen; Reihenfolge: Timeout, Layout, Musikblock, ShowSeconds, Lyrics.

- [ ] **Step 3: Browser-Check**

Im laufenden Dev-Server `http://localhost:3000/boards/default/settings` öffnen, AOD-Sektion prüfen: beide Quellen anhaken, Modus/Filter umschalten, Playerliste zeigt HA- und MA-Einträge, Abhaken einer Quelle löscht den gespeicherten Select nicht (nach Reload weiterhin befüllt). Keine Konsolenfehler.

- [ ] **Step 4: Commit**

```bash
git add apps/nextjs packages/translation
git commit -m "feat: unify AOD music source settings"
```

---

### Task 8: Live-Verifikation und Cleanup

**Files:** keine productiven Änderungen, außer falls die Prüfung einen Fix erzwingt.

- [ ] **Step 1: Lokale Voraussetzungen prüfen**

`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 307; WebSocket-Server bei Bedarf mit `bun run --filter @homarr/websocket dev` neu starten (Hintergrund). Redis muss laufen (`docker exec redis redis-cli ping` → PONG).

- [ ] **Step 2: Szenarien im Browser prüfen**

(a) `fixed` mit HA-Entity: unverändertes Verhalten, Controls funktionieren. (b) `fixed` mit nur MA: Titel/Fortschritt/Queue aus MA, Play/Pause und Skip wirken. (c) `auto` mit mehreren spielenden Playern: der erlaubte mit jüngstem Timestamp erscheint. (d) Filter `exclude` mit zwei von fünf Alexas: nur die anderen drei zählen. (e) Kein spielender Player: Karussell startet auf der Uhr. (f) Lyrics-Toggle und Queue-Toggle weiterhin wie zuvor.

- [ ] **Step 3: Aufräumen**

Temporäre Test-Settings und Fake-MA-WS (falls verwendet) zurücksetzen, Browser-Tab schließen, gitignorierte DB unverändert lassen.

- [ ] **Step 4: Abschlussprüfung**

Run: `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/api --filter=@homarr/validation --filter=@homarr/db && bunx oxlint apps/nextjs/src/components/board/idle-screen apps/nextjs/src/app/[locale]/boards/[name]/settings` → PASS. Kein Push, kein PR.
