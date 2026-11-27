# AOD Lyrics / Queue Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-right lyrics/queue switch to the AOD music layer, with the queue read from a Music Assistant integration whose player is chosen in the board settings.

**Architecture:** A minimal `musicAssistant` integration stores the long-lived token in Homarr's encrypted integration secrets and owns a pooled JSON-RPC WebSocket client. Two protected tRPC queries return the available queues and the selected queue's tracks. Two nullable board fields select the integration and queue; AOD hooks and a local tab state drive the segmented control and the queue panel.

**Tech Stack:** Next.js, Mantine, tRPC, zod v4, drizzle-kit (SQLite + PostgreSQL), Node WebSocket, oxlint/oxfmt, focused vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-aod-lyrics-queue-design.md`

## Global Constraints

- Follow `AGENTS.md`: Mantine + @tabler/icons-react; oxlint/oxfmt; no broad test/E2E suites; no upstream PR or push; no docs beyond the required integration page.
- No new secret kind: reuse `apiKey` and the encrypted `integrationSecrets` table. Never log, return or expose the token to the client or an MCP tool.
- Only authenticated viewers; use `createOneIntegrationMiddleware("query", "musicAssistant")`. No `.meta({ mcp: ... })`.
- MA protocol: `ws://<host>/ws`, envelope `{ command, message_id, args }`, first command `auth` with `{ token, device_name }`; commands `player_queues/all` and `player_queues/get { queue_id }`.
- Queue selection is explicit: an MA queue chosen in board settings; never auto-pick another room's queue.
- Current item comes from MA's queue state (`currentIndex`), never from matching HA titles.
- `idleScreenShowLyrics` stays the availability gate for the left button; no migration for that field.
- Reset temporary board settings, Redis state and browser tabs after live verification.
- Migration numbers: compute the next free number per dialect at implementation time (a parallel task is adding an unrelated board column).

## Review Focus

- **Secret leakage:** token must never appear in tRPC output, MCP metadata, integration `.all` responses or logs — Task 3 output shape and Task 2 normaliser test.
- **Wrong room:** several MA players must not lead to a queue from another player — Task 4 explicit `queueId` setting and Task 6 live check.
- **No player / empty queue:** must render an empty state, not throw — Task 2 normaliser test and Task 5 UI.
- **Duplicate track titles:** current-item highlight must not be guessed by title — Task 2 test with duplicate titles and MA-provided `currentIndex`.
- **WS auth failure, timeout, rotation:** pooled socket must re-auth after config changes and fail closed — Task 2 tests plus Task 6 check.

---

### Task 1: Integration definition and docs

**Files:**
- Modify: `packages/definitions/src/integration.ts` (add `musicAssistant` next to `homeAssistant`; add to `integrationHttpUnavailableReasons`)
- Modify: `packages/definitions/src/docs/sitemap-paths.json` or regenerate via `docs:generate` (new slug)
- Create: `apps/docs/docs/integrations/music-assistant/index.mdx`, `index.ts`
- Create/modify: generated `homarr-docs-sitemap.ts` / metadata snapshot (whatever the repo script writes)

**Interfaces:**
- Consumes: nothing.
- Produces: `IntegrationKind` includes `musicAssistant`; documentation slug `music-assistant`.

- [ ] **Step 1: Add the definition** with `name: "Music Assistant"`, `httpAuth: { type: "adapter" }`, `secretKinds: [["apiKey"]]`, `category: ["mediaService"]`, `documentationSlug: "music-assistant"`, `defaultPort: 8095`, an icon URL from the existing dashboard-icons CDN; add it to the WS-only unavailable-reasons list beside `truenas`.

- [ ] **Step 2: Write the docs page** with the MA URL/port and how to create a long-lived token in MA, plus one line that the AOD queue view uses it. Keep it concise.

- [ ] **Step 3: Regenerate docs metadata** with the repo `docs:generate` script and verify `music-assistant` appears in the generated path type.

- [ ] **Step 4: Verify** with `bun run turbo typecheck --filter=@homarr/definitions --filter=@homarr/docs` and `bunx oxfmt` on touched files.

- [ ] **Step 5: Commit** with message `feat: define Music Assistant integration`.

### Task 2: MA client and integration class (red/green)

**Files:**
- Create: `packages/integrations/src/music-assistant/music-assistant-integration.ts`
- Create: `packages/integrations/src/music-assistant/music-assistant-connection.ts`
- Create: `packages/integrations/src/music-assistant/music-assistant-queue.ts` (pure normaliser + zod shapes)
- Create: `packages/integrations/src/music-assistant/music-assistant-queue.spec.ts`
- Modify: `packages/integrations/src/base/creator.ts` (lazy creator entry)

**Interfaces:**
- Consumes: the `musicAssistant` definition from Task 1; `IntegrationInput` from `base/integration.ts`.
- Produces: `MusicAssistantIntegration.getQueuesAsync(): Promise<QueueInfo[]>`; `getQueueAsync(queueId: string): Promise<QueueView>`; `QueueInfo = { id: string; name: string }`; `QueueView = { tracks: QueueTrack[]; currentIndex?: number }`; `QueueTrack = { title: string; artist?: string; album?: string; durationSeconds?: number }`.

- [ ] **Step 1: Write failing tests** in `music-assistant-queue.spec.ts`: (a) normalising `player_queues/get` data with two tracks that have the same title keeps MA's `currentIndex` and does not derive it from titles; (b) absent queue data yields `{ tracks: [], currentIndex: undefined }`; (c) an envelope carrying an `error_code` is rejected; (d) the normalised output object contains no key named `token` or `apiKey` and no raw envelope fields.

- [ ] **Step 2: Run the tests and confirm they fail** with missing exports.

- [ ] **Step 3: Implement the pure normaliser** with zod schemas for MA's `player_queues/all` and `player_queues/get` payloads; map only title/artist/album/duration and MA's own current-position field.

- [ ] **Step 4: Implement the WS client** modelled on `homeassistant-connection.ts`: one pooled connection per integration, auth handshake, `message_id` correlation, per-command timeout, idle close/reconnect, and pool invalidation when the integration config/secret generation changes. Never log tokens or raw payloads. Implement `getHttpAuthenticationAsync()` as an adapter with no standard HTTP auth.

- [ ] **Step 5: Add the lazy creator entry** in `base/creator.ts` importing the new class.

- [ ] **Step 6: Run the spec and confirm it passes**, then `bun run turbo typecheck --filter=@homarr/integrations` and `bunx oxlint` on the new folder.

- [ ] **Step 7: Commit** with message `feat: add Music Assistant integration client`.

### Task 3: Request handler and tRPC queries

**Files:**
- Create: `packages/request-handler/src/music-assistant.ts`
- Create: `packages/api/src/router/music-assistant.ts`
- Modify: `packages/api/src/root.ts` (lazy `musicAssistant` router)

**Interfaces:**
- Consumes: `MusicAssistantIntegration.getQueuesAsync()` / `getQueueAsync()` from Task 2; `createOneIntegrationMiddleware`, `createIntegrationRequestHandler`.
- Produces: `clientApi.musicAssistant.queues.useQuery({ integrationId })` → `{ queues: QueueInfo[] }`; `clientApi.musicAssistant.queue.useQuery({ integrationId, queueId })` → `QueueView`.

- [ ] **Step 1: Add a cached request handler** following `packages/request-handler/src/smart-home.ts`: namespace `music-assistant`, TTL ~10 s, stale fallback, invalidation path.

- [ ] **Step 2: Add the router** with two queries, each `.concat(createOneIntegrationMiddleware("query", "musicAssistant"))`, zod inputs as above, and outputs restricted to the safe shapes from Task 2. No `.meta({ mcp: ... })`.

- [ ] **Step 3: Register the router lazily** in `packages/api/src/root.ts`.

- [ ] **Step 4: Verify** with `bun run turbo typecheck --filter=@homarr/api --filter=@homarr/request-handler` and `bunx oxlint` on the two new files; confirm by inspection that no procedure returns secrets or accepts an arbitrary URL.

- [ ] **Step 5: Commit** with message `feat: add protected Music Assistant queue queries`.

### Task 4: Board settings fields and projection

**Files:**
- Modify: `packages/validation/src/board.ts` (two nullable string fields in partial + required schema)
- Modify: `packages/db/schema/sqlite.ts` and `postgresql.ts` (two nullable columns, next migration numbers)
- Create: generated migrations for both dialects
- Modify: `packages/api/src/router/board.ts` (select map, save map, MCP descriptions), `onboard/onboard-router.ts`, `apps/nextjs/src/components/assistant/assistant-board-settings-tool.tsx`, `header-widget-runtime-boundary.tsx`, `board-mock.ts`, `_settings-form.tsx`, `_layout-creator.tsx`, `idle-screen.tsx` (`IdleScreenSettings`)
- Modify: `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx` (two selects: MA integration and MA queue, the latter fed by `musicAssistant.queues`)

**Interfaces:**
- Consumes: `clientApi.musicAssistant.queues` from Task 3.
- Produces: `IdleScreenSettings.idleScreenMusicAssistantIntegrationId: string | null` and `idleScreenMusicAssistantQueueId: string | null`.

- [ ] **Step 1: Add both fields to validation and DB schemas**, generate migrations, apply SQLite to the local gitignored DB.

- [ ] **Step 2: Add both fields to API select/save maps, MCP descriptions, onboarding and mocks**, then to the settings form field list/defaults and `IdleScreenSettings` projection in `_layout-creator`.

- [ ] **Step 3: Add the two settings selects** in `_behavior.tsx` inside the idle screen section. The queue select is disabled until an integration is chosen, populated by `musicAssistant.queues`, `clearable`, and writes the queue id. URL/token are not editable here.

- [ ] **Step 4: Verify** with focused typecheck (`nextjs`, `api`, `validation`, `db`), oxlint/oxfmt and the existing `board.spec.ts`.

- [ ] **Step 5: Commit** with message `feat: select Music Assistant queue in board settings`.

### Task 5: AOD segmented switch and queue panel

**Files:**
- Create: `apps/nextjs/src/components/board/idle-screen/use-music-assistant-queue.ts`
- Create: `apps/nextjs/src/components/board/idle-screen/queue-panel.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/music-pane.tsx`, `now-playing.tsx`, `idle-screen.tsx`
- Modify: `apps/nextjs/src/components/board/idle-screen/idle-screen.module.css`
- Modify: `packages/translation/src/lang/en.json`, `de.json`

**Interfaces:**
- Consumes: `IdleScreenSettings` fields from Task 4 and `clientApi.musicAssistant.queue` from Task 3.
- Produces: `useMusicAssistantQueue({ integrationId, queueId, enabled })` returning `{ queue: QueueView | undefined; isLoading: boolean }`.

- [ ] **Step 1: Add the hook** mirroring `use-now-playing.ts`: React Query, enabled only while the music layer is shown and both settings are set, `staleTime` ~10 s, `retry: false`, no window-focus refetch.

- [ ] **Step 2: Add `QueuePanel`** — read-only list of `QueueTrack` with title/artist/album, current item marked via `currentIndex`, and a translated empty state. No controls, no scrolling interference with carousel gestures.

- [ ] **Step 3: Add the segmented control** at the bottom right of the music pane: two Mantine `ActionIcon`s matching the existing playback controls (≥54 px, white translucent `vars()`), left `IconMessage`/lyrics, right `IconList`/queue. Left disabled when `idleScreenShowLyrics` is false; right disabled when no MA integration/queue is configured or the queue is empty. Buttons count as interactive targets for the carousel.

- [ ] **Step 4: Wire local tab state**: default lyrics when enabled, otherwise queue; switching hides the other panel; state resets when the AOD closes. Keep progress bar, times and playback controls unchanged.

- [ ] **Step 5: Add i18n keys** for both button labels, the queue panel aria-label and empty state in `en.json` and `de.json`.

- [ ] **Step 6: Verify** with `bun run turbo typecheck --filter=@homarr/nextjs --filter=@homarr/translation`, oxlint/oxfmt, and the focused idle-screen spec.

- [ ] **Step 7: Commit** with message `feat: add AOD lyrics/queue switch`.

### Task 6: Live verification and cleanup (no commit)

**Files:** none (temporary settings only)

- [ ] **Step 1: Start a local fake MA WS server** on a free port implementing `auth`, `player_queues/all` and `player_queues/get`, and configure the Homarr integration with a throwaway token. Alternatively use the real MA instance if the user supplies a long-lived token; in that case use `openchamber_secret`, never type the token in chat or logs.

- [ ] **Step 2: Configure a demo board** with the MA integration and a queue, open the AOD music layer and verify: queue button enabled, queue items rendered, current item marked, toggle left/right switches panels, progress bar unchanged, no console errors.

- [ ] **Step 3: Verify the empty case** (no player / empty queue) renders the empty state without throwing, and that an anonymous request to both queries is rejected.

- [ ] **Step 4: Reset** board settings, delete the throwaway integration and any Redis mock keys, close browser tabs, stop the fake server. Final `git status --short` shows only intended committed changes and pre-existing untracked user files.
