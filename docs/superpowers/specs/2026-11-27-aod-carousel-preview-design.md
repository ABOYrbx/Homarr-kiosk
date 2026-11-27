# Design: AOD-Vorschau und Drei-Ebenen-Karussell

Datum: 2026-11-27
Status: Entwurf – Freigabe ausstehend

## Intention / Warum

Der Anwender will den Leerlaufbildschirm (AOD) **sofort prüfen können**, ohne den Idle-Timer abzuwarten, und statt einer einzelnen, per Modus gewählten Ansicht eine feste Dreiteilung:

- **Mitte (Standard):** analoge Uhr mit Wetter-Icon und Temperatur, vor einem gefrosteten Hintergrund.
- **Links (nach links wischen):** Musikansicht im Stil des Referenzbildes – **das Titelbild (Cover) als gefrosteter, animierter Hintergrund**, quadratisches Cover, Fortschritt, großer Titel/Interpret, keine Bedienbuttons, Lyrics als zweite Spalte.
- **Rechts (nach rechts wischen):** das selbst erstellte Idle-Layout mit eigenen Widgets.

Der Uhr-Hintergrund ist **überwiegend schwarz** mit einem dezenten Verlauf in einer selbst wählbaren Farbe (Default-Farbe vorhanden). Der Musik-Hintergrund nutzt das Cover des laufenden Titels, stark unscharf und langsam animiert.

Die Referenzbilder zeigen eine Musikansicht **ohne** Transportbuttons; Bedienelemente im AOD sind daher unerwünscht.

## Ziele

1. Button „AOD-Vorschau" in den Board-Einstellungen, Sektion „Leerlaufbildschirm", öffnet den echten Overlay sofort.
2. Der AOD zeigt drei Ebenen: Musik / Uhr+Wetter / Widget-Layout. Start immer die Mitte.
3. Navigation per horizontalem Wisch (Touch + Pointer) und Pfeiltasten; keine sichtbaren Buttons im Overlay.
4. Die Musik-Ebene nutzt die bestehende `NowPlaying`-Komponente unverändert (inkl. Lyrics-Spalte, ohne Buttons).
5. Die Widget-Ebene nutzt `IdleWidgets` / `resolveIdleItems` unverändert.
6. Die Uhr-Ebene nutzt `AnalogClock` und ergänzt eine kompakte Wetteranzeige (Icon + Temperatur).
7. Neues, nullable Board-Feld für den Wetterstandort; deutsche und englische Texte in `de.json`/`en.json`.
8. Neues Board-Feld für die Akzentfarbe des Uhr-Hintergrunds (Farbauswahl mit Default), Hintergrund überwiegend schwarz mit dezentem Farbverlauf.
9. Musik-Hintergrund: Cover des laufenden Titels als gefrosteter, langsam animierter Hintergrund; `prefers-reduced-motion` respektieren.

## Non-Goals / Anti-Goals

- Keine Änderung an UV/DPMS, Wake Lock, `requestFullscreen`, Idle-Timer-Semantik oder dem Musik-/Lyrics-Pfad selbst.
- Keine Media-Transportsteuerung im AOD (Play/Pause/Next/Volume bleiben außen vor).
- Kein Bearbeiten von Widgets innerhalb des AOD; der Layout-Editor bleibt der Ort dafür.
- Keine Custom-Widget-Sandbox-Lockerung; `iframe` bleibt eingebaute Widget-Art, `customApi` bleibt Admin-only.
- Keine Änderung an Layout-Rollen `mobile`/`base`, an der responsiven Layout-Auswahl oder an `saveLayouts`.
- Die frühere Auflösungsfrage des Anwenders ist **nicht** Teil dieses Designs und bleibt vertagt.
- Keine breiten Test-/E2E-Suites; nur fokussierte Vitest-Tests, Typecheck, Lint/Format, Live-Check.

## Constraints

- AGENTS.md: Mantine + `@tabler/icons-react`, kein Tailwind außerhalb der Docs-App, oxlint/oxfmt.
- Der Board-Layout (`apps/nextjs/src/app/[locale]/boards/_layout-creator.tsx`) umschließt **sowohl** die Board-Seite als auch `/settings` und rendert dort `<IdleScreen>` – ein gemeinsamer Context reicht für den Vorschau-Button.
- `now-playing.tsx` rendert bereits Cover, Fortschritt, Titel/Interpret und `LyricsPanel` (zwei Spalten) und enthält keine Buttons. Der bestehende `musicBackdrop` nutzt `blur(60px) brightness(0.42)` über dem Cover plus `musicScrim`; die Animation wird als langsame, dezente Bewegung dieses Backdrops ergänzt und unter `@media (prefers-reduced-motion: reduce)` abgeschaltet.
- Wetter: `widget.weather.atLocation` ist eine öffentliche tRPC-Prozedur mit `{ latitude, longitude }`, benötigt keine Integration. Der Clock-Widget-Optionen-Picker `factory.location` liefert bereits `{ name, latitude, longitude }`.
- Migrationen müssen additiv sein (nullable Spalte), keine destruktive Änderung an `idleScreenMode`.

## Ansätze

### A – Karussell ersetzt den Modus (gewählt)

Die drei Ebenen sind immer vorhanden; die Mitte ist Standard. `idleScreenMode` bleibt in DB/API als unbenutztes Feld liegen, verschwindet aber aus der UI.

- **Vorteil:** Entspricht exakt der Beschreibung; kein zusätzlicher Modus im Dropdown; keine Datenmigration.
- **Preis:** Frühere „Nur Uhr"-Nutzer sehen jetzt auch die anderen Ebenen (können aber in der Mitte bleiben); „Automatisch"-Logik entfällt als Auswahl.

### B – Modus bestimmt die Start-Ebene

Der Modus bleibt und wählt nur, auf welcher Ebene man einsteigt.

- **Vorteil:** Bestehendes Verhalten bleibt für bestehende Konfigurationen erhalten.
- **Preis:** Zwei konkurrierende Navigationsmodelle; harder erklärbar; mehr State.

### C – Neuer Modus „Karussell"

Die alten Modi bleiben, einer kommt dazu.

- **Vorteil:** Geringstes Risiko für bestehende Boards.
- **Preis:** Eine weitere Option im Dropdown; der Anwender muss sie erst aktivieren, obwohl er das Karussell als Standard beschreibt.

### Umsetzungsentscheidungen (eigene Calls)

- **Swipe:** eigener Pointer-/Touch-Handler mit Schwellenwert plus Pfeiltasten; keine neue Bibliothek (im Repo gibt es kein Carousel-Pattern).
- **Vorschau:** React-Context im gemeinsamen Board-Layout (`IdleScreenPreviewProvider`) mit `open()`; `IdleScreen` respektiert `enabled` weiterhin, öffnet aber bei Preview auch wenn der Timer nicht abgelaufen ist. Schließen per Esc/Klick.
- **Wetterstandort:** neues nullable Board-Feld `idleScreenWeatherLocation` (JSON: `{ name, latitude, longitude }`), gepflegt mit dem vorhandenen `factory.location`-Picker; wenn leer, Fallback auf die Position des ersten Wetter-/Clock-Widgets des Boards, sonst auf einen sinnvollen Standard.
- **Uhr-Farbe:** neues Board-Feld `idleScreenClockColor` (Hex-String, Default `rgba`/Hex-Wert in gedämpftem Blau). Der Hintergrund bleibt überwiegend `#050506` und bekommt einen dezenten radialen Verlauf in dieser Farbe; kein helles Flächenfüllen, damit die Uhr lesbar bleibt.
- **Cover-Animation:** langsame, scheinbare Bewegung des unscharfen Cover-Backdrops (z. B. scale/translate über mehrere Sekunden), ohne Einfluss auf Cover, Lyrics oder Fortschritt; unter `prefers-reduced-motion` statisch.
- **Fehlende Konfiguration:** Musik-Ebene ohne HA-Integration/Entity und Widget-Ebene ohne Item zeigen einen kurzen Hinweis statt einer leeren Fläche.

## Aufbau (Handlungsteile)

1. **Datenmodell/Validierung/Router:** `idleScreenWeatherLocation` und `idleScreenClockColor` in SQLite/PostgreSQL-Schema, `boardSavePartialSettingsSchema`, `boardSettingsSchema`, `getBoardSettings`-Spalten, `savePartialBoardSettings`, MCP-Beschreibungen, Translation-Keys en/de. Eine additive Migration für beide Spalten.
2. **Preview-Context:** Provider in `_layout-creator.tsx`, Hook in `idle-screen/`, Verbrauch in `IdleScreen` (Preview öffnet Overlay, Esc/Klick schließt).
3. **Karussell:** Komponente in `idle-screen/` mit drei Ebenen, Wisch-/Tastaturnavigation und Zustand; Mitte = `AnalogClock` + Wetter, links = `NowPlaying` (oder Hinweis), rechts = `IdleWidgets` (oder Hinweis).
4. **Wetter und Hintergrund in der Uhr:** kompakte Anzeige (Icon + Temperatur) aus `widget.weather.atLocation`, mit dem neuen Standortfeld; Wetter-Icon aus dem bestehenden `WeatherIcon`-Baustein; gefrosteter, überwiegend schwarzer Hintergrund mit dezentem Verlauf in `idleScreenClockColor`.
5. **Einstellungs-UI:** Vorschau-Button, Standortfeld, Farbauswahl für den Uhr-Hintergrund; Entfernen der Modus-Auswahl; en/de-Texte.
5b. **Musik-Hintergrund:** bestehenden `musicBackdrop` um eine langsame Animation ergänzen (Cover-basiert, reduzierte Bewegung respektieren).
6. **Verdrahtung/Tests:** fokussierte Tests für Navigation und Standort-Fallback, Typecheck, Lint/Format, Live-Check im Demo-Modus mit Vorschau-Button und Wisch/E Pfeiltasten.

## Klärungen aus dem Builder-Check (eigene Calls)

- **Preview und Idle-Timer:** Der Preview-Zustand liegt außerhalb von `useIdleScreen`; während der Vorschau werden dessen Aktivitäts-Listener deaktiviert. Sonst würde schon der Button-Klick (`pointerdown`) bzw. der erste Wisch/die erste Pfeiltaste den Overlay wieder schließen.
- **Gates:** Preview umgeht `onSettingsPage` (der Button liegt dort) und `idleScreenEnabled` (man will auch im ausgeschalteten Zustand prüfen können). Tour und Edit-Mode sind auf der Einstellungsseite nicht aktiv und werden nicht besonders behandelt.
- **Musik ohne laufenden Titel:** Die Musik-Ebene zeigt auch dann die Musikfläche mit einem kurzen Hinweis („Gerade spielt nichts"), nicht die Uhr – sonst wäre die feste Dreiteilung durchbrochen.
- **Schließen:** Esc schließt immer. Ein Klick auf den leeren Hintergrund schließt nur in der Vorschau; Klicks auf Widgets bleiben interaktiv. Ein Wisch wird nicht als Klick gewertet (Schwellenwert).
- **Standort-Picker:** Eine settings-eigene Auswahl auf Basis von `location.searchCity`; das widget-gebundene `WidgetLocationInput` wird nicht umgebaut.

## Entscheidung des Anwenders zur Vorschau

Die Vorschau zeigt **das, was gebaut wurde** – also den gespeicherten Board-Zustand mit dem tatsächlich angelegten Widget-Layout. Es werden keine ungespeicherten Formular-Entwürfe in den Overlay übertragen; der Preview-Button löst nur `open()` aus. Wer eine Änderung sehen will, speichert zuerst (bzw. speichert im Layout-Editor). Damit bleibt die Vorschau eine getreue Ansicht des realen AOD, genau wie er nach dem Idle-Timer erscheint.

## Testhinweis zur Musik-Ebene

Die Musik-Ebene braucht eine Home-Assistant-Integration mit einem `media_player` (z. B. Music Assistant). In den Board-Einstellungen unter „Leerlaufbildschirm" werden Integration und Entity gewählt und gespeichert; die Vorschau übernimmt erst gespeicherte Werte. Von der Uhr aus erreicht man die Musik per Wisch **nach rechts** oder `ArrowLeft` (`carousel.ts` bildet positive DX auf die vorherige Ebene ab).

Im Demo-Modus ohne Redis lässt sich die Ebene nicht prüfen: Der Smart-Home-Snapshot hängt am gemeinsamen Response-Cache von `@homarr/redis`; ohne laufenden Redis bleibt die Ebene bei „Loading music player…" und der tRPC-Call meldet `Connection is closed`. Der eingebaute Demo-Provider liefert zwar einen `media_player.living_room_tv`, aber ohne Cover-Bild. Für einen echten Test Redis starten (`bun run docker:dev:up`) oder eine echte HA-Integration auf einer Instanz mit Redis verwenden.
