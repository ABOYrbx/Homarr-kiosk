# Keylose Lyrics-API über LRCLIB – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lyrics im Leerlaufbildschirm ohne API-Key über LRCLIB liefern und den Spicy-Key-Pfad vollständig entfernen.

**Architecture:** Der bestehende tRPC-Endpunkt `lyrics.get` bleibt die einzige Schnittstelle zum Client. Serverseitig wird LRCLIB `/api/get` mit Titel, Artist, Album und Dauer abgefragt; die Antwort wird in das bestehende normalisierte `{type, lines, source, provider}`-Format überführt und im vorhandenen TTL-LRU-Cache gehalten.

**Tech Stack:** TypeScript, tRPC, zod v4, `yaml` 2.9 (Root-Catalog), Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-11-27-keyless-lyrics-design.md`

## Global Constraints

- Kein `SPICY_LYRICS_API_KEY`, kein `sl_sk_…`/`sl_pk_…` im Code, im Client oder in Logs; keine Lyrics in Logs.
- Kein Upstream-PR. Mantine + `@tabler/icons-react`, kein Tailwind; oxlint/oxfmt.
- LRCLIB: Basis-URL `https://lrclib.net`, 5 s Timeout, `User-Agent` mit Projektlink, keine Authentifizierung.
- Dauer-Toleranz genau ±2 s; `429`/`503` nicht retrien, 60 s negativ cachen.
- Cache: maximal 500 Einträge, positiv 7 Tage, `not_found` 24 h, Fehler 60 s.

## Review Focus

- Fehlender Artist → ohne Anfrage `not_found`, kein Absturz → Task 4-Test `missing artist returns not_found`.
- Dauer weicht >2 s ab → `not_found` statt falscher Lyrics → Task 1-Test `rejects duration outside 2 seconds`.
- LRCLIB `429` → `error`, kein Retry, 60 s Cache → Task 3- + Task 4-Test `429 maps to error`.
- Kaputtes `lyricsfile`-YAML → Fallback auf LRC/Plain, nie Exception → Task 2-Test `malformed YAML falls back to synced lyrics`.
- Wort ohne `end_ms` → Ende aus nächstem Wort, kein 0-Längen-Highlight → Task 2-Test `word end derives from next word`.

---

### Task 1: Gemeinsame LRCLIB-Helfer (Typen, Matching, Cache)

**Files:**
- Modify: `packages/api/src/router/lyrics/types.ts`
- Modify: `packages/api/src/router/lyrics/match.ts`
- Modify: `packages/api/src/router/lyrics/cache.ts`
- Test: `packages/api/src/router/lyrics/lyrics.spec.ts`

**Interfaces:**
- Consumes: keine.
- Produces: `lrclibRecordSchema`, `LrclibRecord`, `NormalizedLyrics` (ohne `uploader`/`maker`, `source: "lrclib"`, `provider: "LRCLIB"`), `isDurationMatch(expected: number, actual: number): boolean`, `createCacheKey(input: {title: string; artist?: string; album?: string; durationSeconds?: number}): string`, `TtlLruCache<T>.set(key: string, value: T, ttlMs: number): void`.

- [ ] **Step 1: Failing Tests schreiben**

```ts
it("rejects duration outside 2 seconds", () => {
  expect(isDurationMatch(200, 202)).toBe(true);
  expect(isDurationMatch(200, 205)).toBe(false);
});
it("builds a stable key from the track signature", () => {
  expect(createCacheKey({ title: "Track", artist: "Artist", album: "Album", durationSeconds: 200 })).toBe(
    "lrclib:track|artist|album|200",
  );
});
it("expires entries with an explicit TTL", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const cache = new TtlLruCache<string>(2);
  cache.set("a", "lyrics", 1000);
  vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
  expect(cache.get("a")).toBeUndefined();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Tests rot laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: FAIL (Exporte/API fehlen).

- [ ] **Step 3: Helfer implementieren**

`types.ts`: normalisierte Schemas behalten, `uploader`/`maker` entfernen; `source`/`provider` auf Literale `"lrclib"`/`"LRCLIB"` festlegen; `lrclibRecordSchema` mit `id`, `trackName`, `artistName`, `albumName`, `duration`, `instrumental`, `hasWordSync`, `plainLyrics`, `syncedLyrics`, `lyricsfile` (nullable Felder via `.nullish()`).

`match.ts`: `DURATION_TOLERANCE_SECONDS = 2`, `isDurationMatch` als `Math.abs(expected - actual) <= 2`, `createCacheKey` mit kleingeschriebenen, getrimmten Werten in der Reihenfolge `title|artist|album|duration`, Präfix `lrclib:`.

`cache.ts`: Konstruktor `constructor(maxEntries: number)`, `set(key, value, ttlMs: number)`, `get` unverändert, `clear` unverändert.

- [ ] **Step 4: Tests grün laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/router/lyrics/types.ts packages/api/src/router/lyrics/match.ts packages/api/src/router/lyrics/cache.ts packages/api/src/router/lyrics/lyrics.spec.ts
git commit -m "refactor(lyrics): prepare keyless LRCLIB types and cache"
```

---

### Task 2: LRCLIB-Parser (YAML-Wörter, LRC, Plain)

**Files:**
- Modify: `packages/api/src/router/lyrics/normalize.ts`
- Modify: `packages/api/package.json` (`"yaml": "catalog:"` in `dependencies`)
- Test: `packages/api/src/router/lyrics/lyrics.spec.ts`

**Interfaces:**
- Consumes: `LrclibRecord`, `NormalizedLyrics` aus Task 1.
- Produces: `normalizeLrclibRecord(record: LrclibRecord): NormalizedLyrics | null`.

- [ ] **Step 1: Failing Tests schreiben**

```ts
it("parses word-synced lyricsfile timings into seconds", () => {
  const result = normalizeLrclibRecord({
    id: 1, trackName: "T", artistName: "A", albumName: null, duration: 200,
    instrumental: false, hasWordSync: true, plainLyrics: null, syncedLyrics: null,
    lyricsfile: "version: '1.0'\nlines:\n- text: Hello world\n  start_ms: 10180\n  end_ms: 15740\n  words:\n  - text: 'Hello '\n    start_ms: 10180\n  - text: world\n    start_ms: 12000",
  });
  expect(result?.type).toBe("syllable");
  expect(result?.lines[0]).toMatchObject({ start: 10.18, end: 15.74 });
  expect(result?.lines[0]?.words[0]).toEqual({ text: "Hello ", start: 10.18, end: 12 });
});
it("falls back to LRC lines and then plain lyrics", () => {
  const base = { id: 2, trackName: "T", artistName: "A", albumName: null, duration: 200, instrumental: false, hasWordSync: false, lyricsfile: "" };
  expect(normalizeLrclibRecord({ ...base, plainLyrics: null, syncedLyrics: "[00:17.12] First\n[00:20.00] Second" })?.lines[0]).toMatchObject({ start: 17.12, end: 20 });
  expect(normalizeLrclibRecord({ ...base, plainLyrics: "One\nTwo", syncedLyrics: null })?.type).toBe("static");
});
it("malformed YAML falls back to synced lyrics", () => {
  const result = normalizeLrclibRecord({ id: 3, trackName: "T", artistName: "A", albumName: null, duration: 200, instrumental: false, hasWordSync: true, plainLyrics: null, syncedLyrics: "[00:01.00] Safe", lyricsfile: "lines: [oops" });
  expect(result?.lines[0]?.words[0]?.text).toBe("Safe");
});
it("word end derives from next word", () => {
  const result = normalizeLrclibRecord({ id: 4, trackName: "T", artistName: "A", albumName: null, duration: 200, instrumental: false, hasWordSync: true, plainLyrics: null, syncedLyrics: null, lyricsfile: "lines:\n- text: a b\n  start_ms: 1000\n  end_ms: 3000\n  words:\n  - text: a\n    start_ms: 1000\n  - text: b\n    start_ms: 2000" });
  expect(result?.lines[0]?.words[0]?.end).toBe(2);
  expect(result?.lines[0]?.words[1]?.end).toBe(3);
});
```

- [ ] **Step 2: Tests rot laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: FAIL (`normalizeLrclibRecord` fehlt).

- [ ] **Step 3: Parser implementieren**

`normalize.ts`: `YAML.parse` aus `yaml` für `lyricsfile`; die YAML-Struktur mit einem zod-Schema prüfen (`lines`: Array aus `text: string`, `start_ms: number`, `end_ms?: number`, `words?: Array<{text: string; start_ms: number}>`); ms durch 1000 teilen; Wort-Ende = `start_ms` des nächsten Worts, sonst `end_ms` der Zeile, sonst `start_ms + 1`. LRC-Regex `/^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/m`, End-Zeit = Start der nächsten Zeile, sonst Start + 5. Plain: Zeilen mit Start/End 0. Leere Zeilen verwerfen; bei `instrumental` oder ohne Inhalt `null` zurückgeben. Bei Parse-Fehler auf LRC, dann Plain fallen.

- [ ] **Step 4: Tests grün laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/router/lyrics/normalize.ts packages/api/src/router/lyrics/lyrics.spec.ts packages/api/package.json
git commit -m "feat(lyrics): parse keyless LRCLIB lyrics responses"
```

---

### Task 3: LRCLIB-Client mit Statusabbildung

**Files:**
- Create: `packages/api/src/router/lyrics/lrclib.ts`
- Test: `packages/api/src/router/lyrics/lyrics.spec.ts`

**Interfaces:**
- Consumes: `lrclibRecordSchema`, `LrclibRecord` aus Task 1.
- Produces: `fetchLrclibLyrics(input: {title: string; artist?: string; album?: string; durationSeconds?: number}): Promise<{status: "ok"; record: LrclibRecord} | {status: "not_found"} | {status: "error"}>`.

- [ ] **Step 1: Failing Tests schreiben**

```ts
it("maps 404 to not_found and 429 to error", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ status: 404, json: async () => ({}) }).mockResolvedValueOnce({ status: 429, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  const base = { title: "T", artist: "A" };
  expect((await fetchLrclibLyrics(base)).status).toBe("not_found");
  expect((await fetchLrclibLyrics(base)).status).toBe("error");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});
it("queries the signature and validates the body", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ id: 5, trackName: "T", artistName: "A", duration: 200, instrumental: false, hasWordSync: false, plainLyrics: "x", syncedLyrics: null, lyricsfile: "" }) });
  vi.stubGlobal("fetch", fetchMock);
  const result = await fetchLrclibLyrics({ title: "T", artist: "A", album: "Album", durationSeconds: 200 });
  expect(result.status).toBe("ok");
  expect(String(fetchMock.mock.calls[0][0])).toContain("track_name=T&artist_name=A&album_name=Album&duration=200");
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Tests rot laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: FAIL (`fetchLrclibLyrics` fehlt).

- [ ] **Step 3: Client implementieren**

`lrclib.ts`: `const BASE = "https://lrclib.net"`; `URLSearchParams` mit `track_name`, `artist_name`, `album_name`, `duration`; `AbortController` mit 5 s Timeout; Header `User-Agent: "Homarr idle screen (+https://github.com/ABOYrbx/Homarr-kiosk)"` und `Accept: application/json`. Ohne Artist sofort `{status:"not_found"}`. 404 → `not_found`; 429/503/sonstige Fehler → `error`; 2xx mit `safeParse` validieren, bei Fehler `error`. Keine Retries. Kein Response-Body und kein Key in Logs.

- [ ] **Step 4: Tests grün laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/router/lyrics/lrclib.ts packages/api/src/router/lyrics/lyrics.spec.ts
git commit -m "feat(lyrics): add keyless LRCLIB fetch client"
```

---

### Task 4: Router auf LRCLIB umstellen und Key entfernen

**Files:**
- Modify: `packages/api/src/router/lyrics.ts`
- Modify: `packages/api/src/env.ts`
- Modify: `.env.example`
- Test: `packages/api/src/router/lyrics/lyrics.spec.ts`

**Interfaces:**
- Consumes: `fetchLrclibLyrics` (Task 3), `normalizeLrclibRecord` (Task 2), `isDurationMatch`/`createCacheKey` (Task 1), `TtlLruCache` (Task 1).
- Produces: `lyricsRouter.get` mit Input `{title: string; artist?: string; album?: string; durationSeconds?: number}` und Output `{status: "found"|"not_found"|"unconfigured"|"error"; type?; lines?; source?; provider?}`. `unconfigured` entfällt in der Praxis, bleibt aber im Status-Enum für bestehende Clients.

- [ ] **Step 1: Failing Tests schreiben**

```ts
it("missing artist returns not_found without a request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { resolveLyrics } = await import("./router-resolve"); // siehe Step 3
  expect((await resolveLyrics({ title: "T" })).status).toBe("not_found");
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("429 maps to error and is cached briefly", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ status: 429, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  const { resolveLyrics } = await import("./router-resolve");
  expect((await resolveLyrics({ title: "T", artist: "A" })).status).toBe("error");
  expect((await resolveLyrics({ title: "T", artist: "A" })).status).toBe("error");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Tests rot laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts`
Expected: FAIL (`./router-resolve` fehlt).

- [ ] **Step 3: Auflösungsfunktion und Router implementieren**

Neue Datei `packages/api/src/router/lyrics/router-resolve.ts` mit `resolveLyrics(input): Promise<LyricsResult>`: Cache lesen; `fetchLrclibLyrics`; bei `ok` `normalizeLrclibRecord`; wenn `input.durationSeconds` gesetzt und `!isDurationMatch(...)`, `not_found`; Ergebnis mit TTL 7 d / 24 h / 60 s in den Cache legen. `lyrics.ts` importiert diese Funktion und behält `.query(async ({input}) => resolveLyrics(input))`, `protectedProcedure`, Output-Schema und OpenAPI-Meta (Beschreibung auf LRCLIB umstellen). `env.ts`/`runtimeEnv`: `SPICY_LYRICS_API_KEY` entfernen; `.env.example`: die zwei Spicy-Zeilen entfernen.

- [ ] **Step 4: Tests und Typecheck grün laufen lassen**

Run: `bun x vitest run --project api-node packages/api/src/router/lyrics/lyrics.spec.ts && bun run turbo typecheck --filter=@homarr/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/router/lyrics.ts packages/api/src/router/lyrics/router-resolve.ts packages/api/src/router/lyrics/lyrics.spec.ts packages/api/src/env.ts .env.example
git commit -m "feat(lyrics): serve lyrics from LRCLIB without an API key"
```

---

### Task 5: Client, Attribution und Texte umstellen

**Files:**
- Modify: `apps/nextjs/src/components/board/idle-screen/use-lyrics.ts`
- Modify: `apps/nextjs/src/components/board/idle-screen/now-playing.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/lyrics-panel.tsx`
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx`
- Modify: `packages/translation/src/lang/en.json`
- Modify: `packages/translation/src/lang/de.json`

**Interfaces:**
- Consumes: `lyrics.get`-Output aus Task 4 (ohne `uploader`/`maker`).
- Produces: unveränderte `LyricsViewData`-Form für `LyricsPanel`; keine Key-Hinweise mehr in der UI.

- [ ] **Step 1: Test ergänzen**

In `apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts` einen Test ergänzen, der `findActiveLineIndex`/`findActiveWordIndex` weiterhin gegen LRCLIB-artige `lines` prüft (Struktur unverändert); bestehende Tests bleiben.

- [ ] **Step 2: Test rot/grün prüfen**

Run: `bun x vitest run --project dom apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts`
Expected: PASS (bestehendes Verhalten bleibt).

- [ ] **Step 3: Client und Texte anpassen**

`use-lyrics.ts`: Parameter `trackId` und das Query-Feld entfernen; Query-Key bleibt `title|artist|album|durationSeconds`. `now-playing.tsx`: `trackId`, `uploader`, `maker` aus dem Aufruf entfernen. `lyrics-panel.tsx`: `PROVIDER_URL = "https://lrclib.net"`, Attribution `t("idleScreen.attribution")` ohne Provider-Parameter, Uploader-/Maker-Links entfernen. `_behavior.tsx`: Key-Hinweis-`<Text>` entfernen. en/de: `idleScreen.attribution` auf `"Lyrics: LRCLIB"` setzen, `idleScreenShowLyrics.hint` entfernen.

- [ ] **Step 4: Typecheck, Lint und Format prüfen**

Run: `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/api && bun run lint && bun run format`
Expected: PASS, 0 Errors.

- [ ] **Step 5: Commit**

```bash
git add apps/nextjs/src/components/board/idle-screen apps/nextjs/src/app/'[locale]'/boards/'[name]'/settings/_behavior.tsx packages/translation/src/lang/en.json packages/translation/src/lang/de.json
git commit -m "feat(idle-screen): remove key hint and credit LRCLIB"
```

---

### Task 6: Gesamtprüfung

**Files:** keine neuen Dateien.

- [ ] **Step 1: Alle gezielten Checks ausführen**

Run:
```bash
bun x vitest run --project api-node --project dom apps/nextjs/src/components/board/idle-screen/idle-screen.spec.ts packages/api/src/router/lyrics/lyrics.spec.ts
bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/db --filter=@homarr/validation --filter=@homarr/widgets --filter=@homarr/api
bun run lint
bun run format
```
Expected: alle grün.

- [ ] **Step 2: Keylosen Live-Endpunkt prüfen**

Run: `curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 'https://lrclib.net/api/get?track_name=Still+Alive&artist_name=Maximillian&duration=192' -H 'User-Agent: Homarr idle screen (+https://github.com/ABOYrbx/Homarr-kiosk)'`
Expected: `200`; ohne `Authorization`-Header.

- [ ] **Step 3: Arbeitsbaum und Diff prüfen**

Run: `git status --short --branch && git diff --check`
Expected: sauberer Arbeitsbaum, keine Whitespace-Fehler.
