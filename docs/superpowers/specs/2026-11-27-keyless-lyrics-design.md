# Keylose Lyrics-API über LRCLIB – Kurzdesign

## Warum

Spicy Lyrics kennt keinen keylosen Betrieb: Server benötigen `sl_sk_…`, Browser `sl_pk_…` mit Origin-Allowlist. Für den Kiosk soll Lyrics ohne Secret und ohne zusätzliche Konfiguration funktionieren. Der Nutzer hat **LRCLIB als einzige Quelle** gewählt.

## Ziele

- `lyrics.get` liefert synchronisierte Lyrics ohne env-Variable und ohne UI-Eingabe.
- Bestehendes Overlay, Zeilen-/Wort-Highlight, Pause/Freeze, Track-Wechsel und Cache bleiben erhalten.
- Kein Key im Client, keine Lyrics oder Secrets in Logs.

## Non-Goals

- Kein Spicy-Fallback, keine Music-Assistant-WebSocket-Integration, kein iFrame, keine Übersetzungen, kein Seek.
- Kein neues Board-Feld; der vorhandene Lyrics-Schalter bleibt unverändert.

## Randbedingungen

- `AGENTS.md`: Mantine, `@tabler/icons-react`, oxlint/oxfmt, kein Upstream-PR.
- LRCLIB: kostenlos, kein API-Key, `User-Agent` erwünscht, `429`/`503` mit `Retry-After`, Dauerabgleich ±2 s, LRC- und Lyricsfile-YAML (teils Wort-Timings).

## Ansätze

1. **LRCLIB-only (gewählt):** ein Provider, keine Key-Verwaltung. Verzicht auf Spicy-`exact`-Tier, Background-Filter und namentliche Attribution; Matching über Titel/Artist/Album/Dauer.
2. **LRCLIB primär, Spicy optional:** besserer Wort-Sync bei vorhandenem Key, aber zusätzlicher Code und weiterhin eine Key-Option. Vom Nutzer abgelehnt.
3. **Spicy mit festem Publishable Key:** kein Secret, aber fest verbauter `sl_pk_…` mit Origin-Allowlist, die für Self-Hosting nicht sinnvoll ist. Abgelehnt.

## Umsetzung

- `packages/api/src/router/lyrics.ts`: `GET https://lrclib.net/api/get` mit `track_name`, `artist_name`, `album_name`, `duration`; 5 s Timeout, identifizierender `User-Agent`. `404` → `not_found`, `429`/`503` → `error` (60 s negativ gecacht), sonst `error`. Keine Retries.
- Neue Module unter `packages/api/src/router/lyrics/`: LRCLIB-Client, Parser für `lyricsfile`-YAML (`lines[].words`, `start_ms`/`end_ms`), LRC-Zeilen (`[mm:ss.xx]`) und `plainLyrics` als statischen Fallback. `yaml` wird als Dependency von `@homarr/api` ergänzt (im Root-Catalog vorhanden).
- Ergebnisform bleibt `{ type, lines, source, provider }` mit `lines[].words[{text,start,end}]` in Sekunden; `uploader`/`maker` entfallen, weil LRCLIB sie nicht liefert. `source: "lrclib"`, `provider: "LRCLIB"`.
- Schutz vor falschen Treffern: `instrumental` oder `|duration − record.duration| > 2 s` → `not_found`. Ohne Dauer wird der Treffer übernommen (LRCLIB matcht dann nur über Text).
- Input `trackId` entfällt aus Router und `useLyrics` (LRCLIB nutzt keine Spotify-IDs); Cache-Key = `title|artist|album|duration`. Positiv 7 Tage, `not_found` 24 h, Fehler 60 s; maximal 500 Einträge.
- Attribution in `lyrics-panel.tsx`: „Lyrics: LRCLIB" mit Link auf `https://lrclib.net`; alte Uploader-/Maker-Links und Spicy-spezifische Felder entfernen.
- `SPICY_LYRICS_API_KEY` aus `packages/api/src/env.ts`, `runtimeEnv`, `.env.example` und dem Hinweistext in `_behavior.tsx` sowie en/de entfernen. Der Lyrics-Schalter bleibt.
- Die additive `media_content_id`-Normalisierung und der exportierte `useSmartHomeSnapshot` bleiben unangetastet (geringer Churn, keine Auswirkung auf Lyrics).
- Tests: neuer Parser-/Matching-Test (YAML-Wort-Timings, LRC, Plain, Instrumental, Dauer ±2 s, 404/429) und die bestehenden UI-Tests weiterhin grün.

## Prüfung

`bun run turbo typecheck` für die betroffenen Pakete, `bun run lint`, `bun run format`, gezielte Vitest-Tests, Live-Check des Overlays mit einem spielenden Player (sofern verfügbar). Kein `SPICY_LYRICS_API_KEY` mehr nötig; die API ist ohne Key erreichbar.
