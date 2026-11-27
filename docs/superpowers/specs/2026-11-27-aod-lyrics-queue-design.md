# AOD lyrics / queue switch with Music Assistant — design

## Intent and why

The user wants a two-button control at the bottom right of the AOD music layer,
matching the supplied screenshot: left = lyrics, right = queue. The lyrics side
already exists. For the queue side the user explicitly chose a direct Music
Assistant (MA) API connection over HA attributes or an empty placeholder, so
the AOD shows the real upcoming tracks from the MA instance already used by
the household.

## Goals

- A touch-friendly segmented control in the AOD music layer: lyrics on the
  left, queue on the right.
- The queue view lists the real MA queue (upcoming/current tracks) for a
  player/queue explicitly selected in the board settings, not an auto-picked
  queue from another room.
- MA credentials live in Homarr's existing encrypted integration-secret store;
  no token in board settings, client bundles, MCP tools or logs.
- No change to the playback clock, HA media-player logic, carousel gestures or
  the existing lyrics panel behaviour.

## Non-goals / anti-goals

- No new Home Assistant queue support, no LRCLIB changes, no new board fields
  for MA URL or token.
- No Custom Widget solution: the JSX sandbox deliberately allows declarative
  HTTP only, not arbitrary WebSockets, and loosening it is forbidden.
- No generic WS proxy for other integrations; this client is MA-specific.
- Only authenticated viewers are supported: the standard integration
  `query` permission applies. No board-scoped anonymous access path is built.

## Constraints

- `AGENTS.md`: Mantine + @tabler/icons-react, oxlint/oxfmt, no broad test or
  E2E suites, no upstream PR/push, focused verification only.
- Secrets: AES-encrypted `integrationSecrets` with `SECRET_ENCRYPTION_KEY`
  (`@homarr/common/server`), existing `apiKey` secret kind, no new kind.
- A new integration requires a definition entry, a lazy creator entry and a
  user-facing docs page (`apps/docs/docs/integrations/music-assistant/`).
- MA protocol: `ws://<host>/ws`, JSON-RPC envelope
  `{ command, message_id, args }`; first command is `auth` with
  `{ token, device_name }`; useful commands: `player_queues/all`,
  `player_queues/get { queue_id }`. MA instance in use: port 8095.
- `NO_EXTERNAL_CONNECTION` and the existing Redis cache-generation pattern
  must be respected.

## Approaches considered

- **A – HA media-player attributes:** smallest UI change, but HA does not
  expose the MA queue, so the button would almost never be available. Rejected
  earlier by the user.
- **B – minimal `musicAssistant` integration + protected tRPC endpoint
  (chosen):** the token is stored in the existing encrypted secret table,
  access goes through the existing integration middleware, and the AOD hook
  mirrors `use-now-playing`/`use-lyrics`. One definition entry, one creator
  entry, one thin WS client class, one tRPC router and docs — no widget, no
  migration, no new secret kind.
- **C – board settings with URL + token and a bespoke endpoint:** avoids the
  integration framework but re-invents encryption, redaction and permission
  checks and puts a secret into board data. Rejected.
- **D – Custom Widget:** impossible without loosening the sandbox; rejected.

## Design

### 1. Integration definition and creator

- `packages/definitions/src/integration.ts`: add `musicAssistant` with
  `name: "Music Assistant"`, `httpAuth: { type: "adapter" }`,
  `secretKinds: [["apiKey"]]`, `category: ["miscellaneous"]` (not `mediaService` — that category means a media server with streaming sessions and its request handler calls `getCurrentSessionsAsync`),
  `documentationSlug: "music-assistant"`, `defaultPort: 8095` and an icon URL
  from the existing dashboard-icons CDN. Add it to
  `integrationHttpUnavailableReasons` so generic HTTP requests are refused
  (WS-only integration), following the `truenas` example.
- `packages/integrations/src/base/creator.ts`: lazy creator entry importing a
  new `packages/integrations/src/music-assistant/music-assistant-integration.ts`.
- The class extends `Integration`, implements `getHttpAuthenticationAsync()`
  (adapter: no standard HTTP auth) and exposes `getQueuesAsync()` /
  `getQueueAsync(queueId)` returning zod-validated, normalised queue data.
- WS client: one pooled connection per integration, modelled on
  `packages/integrations/src/homeassistant/homeassistant-connection.ts`:
  auth handshake, `message_id` correlation map, per-command timeout, idle
  close, reconnect, and invalidation when the integration configuration or
  secret generation changes (Redis generation / `getIntegrationCacheGenerationAsync`).
  Never log tokens or raw envelopes.

### 2. Server endpoint

- New `packages/api/src/router/music-assistant.ts`, registered lazily in
  `packages/api/src/root.ts`.
- One query procedure, e.g. `queue`, with
  `.concat(createOneIntegrationMiddleware("query", "musicAssistant"))`,
  input `{ integrationId: string; queueId: string }` and output a compact
  `{ tracks: { title, artist?, album?, durationSeconds? }[]; currentIndex?: number }`.
  No `.meta({ mcp: ... })`: queue contents are not an MCP tool.
- A second query, e.g. `queues`, with the same middleware and input
  `{ integrationId: string }`, returns `{ queues: { id, name }[] }` for the
  settings dropdown. An empty player list returns an empty array, not an error.
- `currentIndex` comes from MA's own queue state (current item / played-track
  count). Decision (lead call): do not infer it by matching HA titles, which
  is fragile with duplicate tracks; when MA reports none, omit it and render
  no highlight.
- Caching/deduplication via `createIntegrationRequestHandler` (pattern from
  `packages/request-handler/src/smart-home.ts`) with a short TTL (~10 s) and
  stale fallback, so a rendered AOD never opens sockets per frame.

### 3. AOD UI

- New hook `apps/nextjs/src/components/board/idle-screen/use-music-assistant-queue.ts`
  mirroring `use-now-playing.ts`: enabled only while the overlay shows the
  music layer and an MA integration is configured, `retry: false`, no window
  focus refetch.
- `apps/nextjs/src/app/[locale]/boards/[name]/settings/_behavior.tsx`:
  next to the HA player selector, add a select for the configured MA
  integration and a second select for the MA queue/player, populated by the
  `queues` procedure. URL and token stay in the encrypted integration, never
  in board settings.
- `IdleScreenSettings` gains `idleScreenMusicAssistantIntegrationId` and
  `idleScreenMusicAssistantQueueId` (both nullable) and is threaded through
  `_layout-creator` and the runtime mock. Two new nullable board columns plus
  a generated migration are in scope; both default to null.
- `music-pane.tsx` / `now-playing.tsx`: add a segmented control at the bottom
  right of the music pane, two touch-sized Mantine `ActionIcon`s styled like
  the existing playback controls (left `IconMessage`/lyrics, right
  `IconList`/queue). Clicking left shows the existing `LyricsPanel`; clicking
  right shows a new read-only queue panel listing track title, artist and a
  highlight for the current item. Buttons count as interactive targets for
  the carousel (no layer swipe/tap-to-close). The queue button is disabled
  when no MA integration is configured or the queue is empty.
- `idleScreenShowLyrics` remains the availability gate (lead call): when it is
  off, the left button is disabled and the queue becomes the default view.
  No compatibility handling beyond the existing default is needed.
- Default view: lyrics when lyrics are enabled, otherwise queue when
  available; the choice is local state and resets when the AOD closes.
- i18n keys under `board.idleScreen.*` in `en.json` and `de.json`, including
  the new setting and the queue panel's empty state.

### 4. Docs

- `apps/docs/docs/integrations/music-assistant/index.mdx` + `index.ts`,
  following the Home Assistant integration page: what it is for, how to
  create a long-lived token in MA, which URL/port to use, and the note that
  it is used by the AOD queue view. Keep it concise per `documentation-sync`.
- Regenerate the docs sitemap metadata with the repo script so the new slug
  is accepted by the type-level documentation path check.

### 5. Verification

- Focused typecheck of the touched packages, oxlint/oxfmt, and only the
  existing focused tests for the touched areas (no new permanent tests
  unless a security boundary needs one).
- Live check in the demo board: configure a local/fake MA WS endpoint (or the
  real instance if a token is supplied), confirm auth, queue list, toggle
  switching, empty state and no console errors. Reset all temporary settings.

## Decisions from the builder check

- **Queue selection (user):** an explicit MA player/queue chosen in the board
  settings; no auto-pick from another room.
- **Viewers (user):** authenticated viewers only; the standard integration
  `query` permission is sufficient, no anonymous board access path.
- **Current item (lead):** use MA's reported queue position; never guess by
  matching HA titles. No highlight when MA reports none.
- **Lyrics gate (lead):** keep `idleScreenShowLyrics` as the availability gate,
  disable the left button when it is off, no migration for that field.

## What is left to the implementer

- Exact zod shapes returned by MA commands, verified against the live server
  or MA source; the queue UI only needs title/artist/album/duration.
- Concrete CSS placement and class names of the segmented control.
- Migration numbers for the two new nullable board columns.
