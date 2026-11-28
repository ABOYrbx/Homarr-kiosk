# Design: Vereinheitlichte AOD-Musikquelle (Home Assistant + Music Assistant)

Datum: 2026-11-28
Status: Freigegeben (Ansatz A, „komplett")

## Intention / Warum

Die AOD-Einstellungen zeigen heute vier getrennte Felder: HA-Integration, Media-Player-Entity, MA-Integration und MA-Queue. Der Anwender möchte einen einzigen Musikkreis, in dem Home Assistant und Music Assistant **beide gleichzeitig** konfiguriert werden können. Statt immer nur eine feste Entity zu wählen, soll der AOD automatisch das **gerade spielende Gerät** aller erlaubten Player anzeigen. Dabei muss er Player einzeln ein- oder ausschließen können (Beispiel: fünf spielende Alexas, von denen nur drei zählen).

Zusätzlich soll Music Assistant den kompletten Now-Playing-Teil liefern können – nicht nur die Queue –, inklusive Fortschritt und eigener Wiedergabesteuerung.

## Ziele

1. Ein Settings-Block „Musik" ersetzt die vier Felder optisch; alle vier alten Board-Felder bleiben als Datengrundlage erhalten (keine destruktive Migration).
2. Modus `fixed` (wie heute) oder `auto` (spielendes Gerät aus der erlaubten Liste).
3. Filter `include` (nur angehakte Player) oder `exclude` (alle außer angehakten); Standard `exclude` mit leerer Liste = alle Player.
4. HA und MA können parallel aktiv sein. In `fixed` gewinnt HA, wenn eine HA-Entity gesetzt ist; MA allein steuert das Now-Playing, wenn keine HA-Entity gesetzt ist.
5. In `auto` liefert der gewählte Player Titel/Interpret/Cover/Fortschritt/Queue und die fünf Steuerelemente (Play/Pause, Vor, Zurück, Lyrics-Toggle, Queue-Toggle).
6. Lyrics bleiben über `idleScreenShowLyrics` gegated; der Lyrics-Button bleibt ein Toggle.

## Non-Goals / Anti-Goals

- Kein Upstream-PR, kein Push.
- Keine Änderung an UV/DPMS, `requestFullscreen`, Idle-Timer, Widget-Ebene, Uhr-Ebene oder Layout-Rollen.
- Keine Custom-Widget-Sandbox-Lockerung, keine neuen Abhängigkeiten.
- Keine breiten Test-/E2E-Suites; nur fokussierte Checks und Live-Check im Browser.
- Kein Eingriff in `usePlaybackClock`, `computePlaybackPosition`, Lyrics-Zeitlogik oder die 30-s-Extrapolationsgrenze.

## Constraints

- AGENTS.md: Mantine + `@tabler/icons-react`, oxlint/oxfmt.
- Additive Migrationen: SQLite 0062, PostgreSQL 0031 (nächste freie Nummern), plus Schema-, Validation-, API- und Doku-MCP-Beschreibungen entlang des bestehenden Musters.
- Settings-Seite, Board-Seite und AOD-Vorschau teilen denselben Board-State; Änderungen wirken ohne Reload.
- Der AOD abonniert Daten nur, solange das Overlay offen ist (bestehendes Prinzip von `MusicPresence`/`MusicPane`).
- `player_queues/all` und `player_queues/get` liefern `state`, `elapsed_time`, `elapsed_time_last_updated`, `current_index` und Queue-Items; MA-Bilder sind best effort (`image_url`/`metadata`), ein fehlendes Cover ist kein Fehler.

## Ansätze

### A – Vereinheitlichtes Modell + Musikquellen-Schicht (gewählt)

Vier neue Board-Felder, eine normalisierte `MusicTrack`-Struktur und Adapter für HA und MA. Settings, Auto-Auswahl, MA-Now-Playing und MA-Steuerung werden zusammen gebaut.

*Trade-off:* größter Umbau; erfüllt aber „beide gleichzeitig", Auto-Erkennung mit Ein-/Ausschluss und „MA komplett" ohne getrennte Sonderfälle.

### B – Nur Settings zusammenfassen (verworfen)

Ein Block, aber intern bleiben zwei Auswahlen; Auto wählt nur aus HA-Playern, MA liefert nur die Queue.

*Trade-off:* kleiner, aber „MA komplett" und die MA-Autoliste fehlen – der Anwender hätte seine Zusatzanforderungen nicht erfüllt.

### C – Ein JSON-Feld statt der vier Felder (verworfen)

Alles in einem neuen Feld, alte Werte migriert.

*Trade-off:* sauberstes Datenmodell, aber höchstes Risiko für bestehende Boards, MCP-Allowlist und API-Doku.

## Umsetzung

### Datenmodell (additiv)

- `idleScreenMusicSources`: Text (JSON-Array), Werte `"homeAssistant" | "musicAssistant"`. Explizite Quellenauswahl der zwei Checkboxen; **Abhaken deaktiviert nur die Quelle, löscht aber keine gespeicherte Integration/Entity/Queue**. Die Migration befüllt es aus den alten Feldern: HA aktiv, wenn Integration + Entity gesetzt, MA aktiv, wenn Integration + Queue gesetzt. Dadurch behalten bestehende Boards ihr Verhalten.
- `idleScreenMusicSelectionMode`: Text, Default `fixed`, Werte `fixed | auto`.
- `idleScreenMusicPlayerFilterMode`: Text, Default `exclude`, Werte `include | exclude`.
- `idleScreenMusicPlayerIds`: Text (JSON-Array), Default `[]`. IDs tragen Quelle **und Integrations-ID** als Präfix: `ha:<integrationId>:<entityId>` bzw. `ma:<integrationId>:<queueId>`. Damit bleiben Einträge bei mehreren HA-/MA-Integrationen eindeutig und der Auto-Hook weiß, welche Integration er abfragen/steuern muss.
- Die vier bestehenden Felder (`idleScreenHomeAssistantIntegrationId`, `idleScreenMediaPlayerEntityId`, `idleScreenMusicAssistantIntegrationId`, `idleScreenMusicAssistantQueueId`) bleiben unverändert; bestehende Boards behalten ihr Verhalten (`fixed`).

### Settings-UI (`settings/_behavior.tsx`)

Ein `SectionCard`-Innerer Block statt der vier Selects:

```
Musik
  Quellen:  [x] Home Assistant   [x] Music Assistant
  Modus:    ( ) Fester Player    ( ) Automatisch – spielendes Gerät

  HA-Integration:  [ Home Assistant v ]     MA-Integration:  [ Music Assistant v ]
  Fester Player:   HA [ Jetzt läuft v ]     MA [ Küche v ]   ← je nach aktiver Quelle
  Automatisch:     [ Einbeziehen | Ausschließen ]
                   [x] Küche (HA)   [x] Wohnzimmer (MA)   [ ] Alexa 4   [ ] Alexa 5
```

- Quellen sind zwei umschaltbare Checkboxes; mindestens eine Quelle muss aktiv sein (sonst Meldung wie heute „keine Integration verfügbar"). Die Integrations-Selects bleiben pro Quelle erhalten – der Anwender wählt weiterhin explizit, welche HA-/MA-Instanz gemeint ist.
- Die Playerliste kommt aus `smartHome_searchCatalog` (HA, `domains: ["media_player"]`, pro HA-Integration) und `musicAssistant.queues` (MA, pro MA-Integration); die Präfixe machen sie auch bei mehreren Instanzen eindeutig.
- Beim Wechsel der Quelle oder Modus werden verwaiste Alteinträge der Liste nicht stillschweigend gelöscht, sondern bleiben in der Liste (Präfix macht sie zuordenbar); die Validierung der festen Selects bleibt wie heute.
- i18n en/de für alle neuen Labels, Beschreibungen und Hinweise.

### Normalisierter Track (`idle-screen/music-track.ts`, neu)

```
type MusicTrack = {
  source: "homeAssistant" | "musicAssistant";
  playerId: string;
  playerName: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state: "playing" | "paused" | "idle";
  positionSeconds?: number;
  positionUpdatedAt?: number;   // ms epoch für die Clock
  durationSeconds?: number;
  mediaContentId?: string;      // Track-Identität für buildTrackKey
  queue?: QueueView;            // MA-Queue, nur für die Queue-Ansicht
};
```

`NowPlaying` nimmt künftig `MusicTrack` statt `SmartHomeEntity` und einen `onControl(action)`-Callback. Die vorhandenen Felder werden 1:1 auf `PlaybackState`, `buildTrackKey`, `useLyrics`, Fortschrittsleiste und Lyrics-Scroll übertragen. Der HA-Adapter bildet `attributes.mediaTitle/mediaArtist/mediaAlbum/pictureUrl/mediaPosition/mediaPositionUpdatedAt/mediaDuration` und `entity.state` ab; der MA-Adapter bildet `state`, `elapsed_time`, `elapsed_time_last_updated`, `current_index` und den aktuellen Queue-Item ab.

### MA-Erweiterungen

- `music-assistant-queue.ts`: `QueueInfo` um `state`, `elapsedTime`, `elapsedTimeLastUpdated`, `currentIndex` und `durationSeconds` des aktuellen Items erweitern; `normalizeQueues` und `normalizeQueue` parsen die neuen Felder tolerant (optional, null erlaubt).
- `music-assistant-integration.ts`: `getNowPlayingAsync()` (liefert den normalisierten MA-Track) und `controlAsync(queueId, action)` für `play_pause`, `next`, `previous`, `seek` über die bestehende WS-Verbindung.
- Neue Request-Handler und tRPC-Prozeduren `musicAssistant.nowPlaying` und `musicAssistant.control` (protected, über `createOneIntegrationMiddleware("query"|"mutation", "musicAssistant")`).
- `useMusicAssistantNowPlaying()` analog zu `useMusicAssistantQueue()`, nur solange das Overlay offen ist.

### Auto-Auswahl (`idle-screen/use-music-source.ts`, neu)

- HA-Kandidaten: `useSmartHomeSnapshot` mit `domains: ["media_player"]`, plus `entityIds` bzw. `excludedEntityIds` je nach Filtermodus; nur live, solange das Overlay offen ist.
- MA-Kandidaten: `musicAssistant.nowPlaying`/`queues`, gefiltert nach `idleScreenMusicPlayerIds` mit `ma:`-Präfix.
- Auswahl: erster Kandidat mit `state === "playing"`; bei mehreren der mit dem jüngsten `positionUpdatedAt` (bzw. HA-`lastUpdated`), danach HA vor MA als stabile Reihenfolge. Kein Kandidat → Karussell startet auf der Uhr, `MusicPane` zeigt „nichts spielt".
- `fixed`: bestehendes Verhalten unverändert; MA-only (ohne HA-Entity) nutzt den MA-Adapter.
- `MusicPresence` nutzt dieselbe Auswahl für den `initialLayer`; das Overlay selbst wird **nicht** automatisch geöffnet. Timer/Vorschau bleiben der einzige Öffnungsweg, damit das Abo weiterhin nur bei geöffnetem Overlay existiert.

### Steuerung

- HA: bestehender `widget.smartHome.executeAction`-Pfad bleibt.
- MA: `musicAssistant.control` mit `queueId`; nicht unterstützte Aktionen werden deaktiviert (wie heute über `supported_features` bzw. MA-Fähigkeiten).
- Lyrics-/Queue-Toggle bleiben lokal in `NowPlaying` (`activeView`), der Lyrics-Button bleibt Toggle wie in `66fa97e3a`.

### Reihenfolge und Prüfung

1. DB/Schema/Validation/API + i18n.
2. MA-Normalisierung, Integration, Prozeduren und fokussierte Unit-Tests (rot→grün für State/Position/Icons).
3. `MusicTrack`-Refactor von `NowPlaying` + HA-Adapter (bestehende Tests müssen grün bleiben).
4. Auto-Auswahl-Hook + `MusicPresence`/`IdleScreen`-Verdrahtung.
5. Settings-Block (Mantine, Styles API), Live-Check mit lokalem Fake-MA-WS und HA-Demo-Provider: fixed, auto, include/exclude, MA-only, beide gleichzeitig, Cover/Fortschritt/Queue, keine Konsolenfehler.
6. Aufräumen: Test-Settings und Fake-WS zurücksetzen, Browser-Tab schließen, fokussierter Typecheck/oxlint/oxfmt.

## Offene Punkte an den Anwender

Keine. Die zwei relevanten Entscheidungen (beide Quellen gleichzeitig, MA komplett, Ansatz A inkl. MA-Steuerung) sind getroffen.
