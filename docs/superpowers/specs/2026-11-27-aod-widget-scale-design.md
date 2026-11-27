# Design: AOD-Widget-Skala einstellbar

Datum: 2026-11-27
Status: Freigegeben (Richtung vom Anwender gewählt)

## Intention / Warum

Die Widget-Ebene des AOD rendert sechs große Karten. Die Skalierung wird bisher automatisch aus der Viewport-Größe berechnet (`min(1, verfügbare Breite/Inhalt, verfügbare Höhe/Inhalt)`). Auf einem Kiosk mit großem Display sollen die Karten größer eingestellt werden können, als die automatische Anpassung aktuell zulässt.

## Ziele

1. Neues Board-Feld `idleScreenWidgetScale` (Zahl, Default `1`), additiv migriert, im Board-Settings-Formular als Slider erreichbar.
2. Der Slider multipliziert die automatisch berechnete Skala (50 %–200 %, Schritt 5 %). Der Wert wirkt sofort in der AOD-Vorschau und im laufenden AOD.
3. Überschreitet die skalierte Fläche den Bildschirm, bleibt sie verschiebbar (Touch/Pointer), damit alle Karten erreichbar sind.
4. Wischen vom Hintergrund wechselt weiterhin die Ebene; Tippen schließt weiterhin; Pfeiltasten bleiben unverändert.

## Non-Goals / Anti-Goals

- Keine Änderung an Musik-Ebene, Uhr-Ebene, Idle-Timer, `requestFullscreen` oder `isIdleScreenEnabled`.
- Kein Eingriff in die Widget-Daten oder das Layout-Raster (Spalten/Zeilen bleiben wie sie sind).
- Keine Custom-Widget-Sandbox-Lockerung, keine neuen Abhängigkeiten.
- Keine breiten Test-/E2E-Suites; nur fokussierte Prüfung und Live-Check.

## Constraints

- AGENTS.md: Mantine + `@tabler/icons-react`, oxlint/oxfmt, keine Tailwind-UI im Next.js-App.
- Additive Migrationen in SQLite und PostgreSQL; bestehende Boards behalten den Default ohne Datenverlust.
- Settings-Seite und Board-Seite teilen sich den Board-Context; die Vorschau liest denselben Board-State.
- Die Karten sind absichtlich mit 24 px Innenabstand versehen (`idle-screen.module.css`); der Slider verändert nur die äußere Skala.

## Ansätze

### A – Zoom mit Verschieben (gewählt)

Der Slider ist ein Multiplikator auf die Autofit-Skala. Bei Werten über dem Fit-Limit wächst die Fläche über den Bildschirm hinaus und wird scrollbar/pannbar. Das ist auf kleinen wie großen Kiosk-Displays nutzbar; der Preis ist etwas mehr Logik im AOD-Frame und die Notwendigkeit, Scrollen und Ebenen-Wischen zu trennen.

### B – Zoom nur bis zum Rand (verworfen)

Der Slider vergrößert bis zur maximal passenden Skala und stoppt dort. Kein Abschneiden und kein Verschieben nötig, aber auf kleineren Screens hat er oberhalb des Fit-Werts keinerlei Wirkung – genau dort, wo der Anwender ihn brauchen würde.

## Umsetzung (Entscheidungen, die der Anwender nicht mehr treffen muss)

- Feldname `idleScreenWidgetScale`, Default `1`, Bereich `0.5`–`2`, Schritt `0.05`; Anzeige als Prozent.
- Neue Spalte in SQLite/Postgres mit Default `1`, plus Schema- und API-Erweiterung entlang des bestehenden Musters (`idleScreenClockColor`).
- Slider in der AOD-Sektion der Board-Einstellungen, direkt bei der AOD-Vorschau, mit deutschem und englischem Label/Hinweis.
- `IdleWidgets` multipliziert die bestehende Fit-Skala mit dem Board-Wert; der Frame erhält `overflow: auto`, sobald die Fläche größer als der Viewport ist, und versteckt die Scrollbars.
- Ebenen-Wischen bleibt auf Hintergrundflächen; Verschieben der Kartenfläche passiert auf den Karten selbst.
