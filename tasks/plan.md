# Table Screen Sharing — implementation plan

## Architectural findings

Inspected before planning. The spec and the codebase differ in six places.

### 1. The product spec currently forbids this feature  (needs your decision)

`Virtual_Cafe_SPEC_v1.0.md` §2.3 "Không thuộc MVP" lists
**"Video call, chia sẻ màn hình và họp trực tuyến"** — screen sharing is
explicitly out of scope. The new feature spec reverses that. Proceeding on the
assumption the new spec supersedes it; §2.3 should be amended in the same PR so
the two documents do not contradict each other.

### 2. The current token actively blocks screen sharing  (needs your decision)

`voice.service.ts` issues `canPublishSources: ['microphone']`, with the comment
"the token cannot publish a camera or a screen share" — a deliberate privacy
guarantee enforced in the grant rather than the client. Screen sharing cannot
work until that becomes `['microphone', 'screen_share']`.

This is a permission widening on a security boundary, so it gets explicit
sign-off before it is changed (task 3), not a silent edit.

### 3. Per-table LiveKit rooms already exist — but screen needs its OWN

~~Screen share reuses the voice room.~~ **Corrected during task 7.**

Voice already uses `cafe__<instanceId>__<groupId>`, server-named from seat
state, so isolation is structural. The mistake was concluding screen share
could reuse it.

The voice grant carries `canSubscribe: true`, and a voice token is only issued
once someone has *deliberately* joined the conversation. Watching a screen is
not conditional on joining — so reusing the room would have handed every
viewer the table's live microphone audio without them ever choosing to listen,
silently undoing the rule that hearing a table is a deliberate act.

Screen therefore gets `cafe__<instanceId>__<groupId>__screen`. Two rooms keep
the permissions independent: voice stays microphone-only and opt-in, and a
screen token carries no microphone at all. This also let task 3's widening of
the voice grant be reverted entirely.

### 4. Tokens are hand-minted, not from the LiveKit Server SDK

The spec asks for the Server SDK. `voice.service.ts` signs the JWT directly
with `jsonwebtoken`. The claim shape was verified against LiveKit's documented
token format and is exercised by the smoke suite against real credentials.
Recommendation: keep it. Adding the SDK is a new dependency for no behavioural
gain. Revisit if server-side room administration (participant removal via API)
is needed later.

### 5. Concurrency: an in-process claim beats a database transaction here

The spec asks for a DB transaction to prevent two simultaneous publishers. This
server runs as exactly one instance (no Socket.IO Redis adapter — see README)
and defaults to the in-memory store with no database at all. A synchronous
check-and-set in Node is therefore atomic by construction and works with or
without Postgres; a DB constraint would not work in the default configuration.
Postgres persistence is for metadata/audit only, never for the race.

### 6. No `tableId` in the API path  (safer than the spec as written)

The spec suggests `/tables/:tableId/screen-share/*`. Every endpoint would then
have to re-verify that the path parameter matches the caller's real seat, and
forgetting that check once is a cross-table data leak. The existing convention
(`POST /voice/token`) takes no identifiers and derives everything from the
session.

Recommendation: `/voice/screen-share/*` with **no tableId anywhere** — in the
path, body, or socket payload. The table is derived from the server's seat
state. This satisfies "a client must not be able to change a table ID" by
making the parameter nonexistent rather than validated.

## Tasks

Backend first, as the spec requires. Each task is one commit with tests.

- [x] **1. Session registry** — claim/release one publisher per table, derived
      from server-side seat state. Pure logic, no LiveKit, no DB.
      *Done: `voice/screen-share.service.ts`, 12 tests in
      `test/screen-share.spec.ts`.*
- [x] **2. Revocation** — release on stand, table change, leave café and
      disconnect. *Done: validity is derived on read (`live`/`activeAt`) so a
      stale slot cannot be observed, plus `releaseIfStale` for announcing it
      once. 6 tests.*
- [x] **3. Token grant** — *superseded in task 7.* The voice grant is back to
      `['microphone']` for everyone; screen publishing is granted in the
      separate screen room instead.
- [x] **4. REST** — `GET /voice/screen-share` (state) and `POST` start/stop,
      rate limited per caller. *Done: 11 tests. No table id in any route.
      The seated cross-table check over real HTTP is deferred to task 10,
      where the smoke suite's pathfinding already exists.*
- [x] **5. Socket events** — `screen-share:started|stopped|failed`, broadcast
      only to `audienceFor()` (table members + publisher), metadata only.
      Sweeps wired to all four lifecycle points. *Done: 5 audience tests plus
      an end-to-end socket check. `participant-joined/left` deliberately
      omitted — see below.*
- [x] **6. Persistence** — `screen_share_sessions` metadata through the
      existing `Store` abstraction; memory + Postgres + schema.sql.
      *Done: 8 tests. Audit writes are fire-and-forget so a database problem
      cannot stop someone sharing. **The Postgres path is untested against a
      live database** — no local Postgres and no Docker; only the in-memory
      store is covered by tests.*
- [x] **7. Web client** — publish/subscribe via the LiveKit SDK, store state.
      *Done: `screenShareState.ts` (pure, 12 tests), `screenShareClient.ts`
      (LiveKit, integration code), API methods, store fields. Added jest to
      the web workspace — it had no test runner at all. The LiveKit layer is
      not unit tested: mocking an SFU would produce tests that pass while
      production breaks, so it is verified in a real browser in task 8/9.*
- [x] **8. Web UI** — floating panel, focus mode, the ten required states.
      *Done: `ScreenSharePanel.tsx` plus the orchestration in `useCafe`
      (socket lifecycle, token fetch, transport driven by `needsScreenRoom`).
      5 more tests. **Not yet verified with a real screen capture** — see
      below.*\
- [x] **9. Errors and reconnection** — the cases in spec §10.
      *Done: capability check for unsupported browsers, and one classifier
      deciding local state / message / whether to interrupt. 8 more tests.
      Also fixed an English string missed by the translation pass.*
- [x] **10. Isolation tests** — cross-table access attempts in the smoke suite.
      *Done: 10 checks against a running server, 26/26. Mutation-verified —
      leaking sessions across tables makes the suite fail. This closes the gap
      deferred from task 4.*
- [x] **11. Docs** — README section (how it works, the four isolation
      layers, the endpoints, how to try it) and `Virtual_Cafe_SPEC_v1.0.md`
      §2.3 amended so the spec no longer contradicts shipped code. Every
      documented endpoint was checked against the running server.

- [x] **12. The screen takes the room over** — a live share expands over the
      café for the publisher and for everyone who joins to watch, instead of
      waiting for each of them to press *Phóng to*. One pure rule
      (`nextScreenShareFocus`, 8 tests) decides the layout from the phase, and
      a deliberate *Quay lại quán* outranks it for the rest of that share.
      Applied from `useCafe`, not the panel, so the takeover does not depend
      on the side panels being open. *Not visually verified — same two-browser
      limit as tasks 8–10.*

## How table-level authorization is enforced

Four independent layers, no UI involvement:

1. **Derivation** — the table is read from `player.presence.seatId`; the client
   never supplies it.
2. **Room scoping** — the LiveKit token grants exactly one room,
   `cafe__<instanceId>__<groupId>`. Another table's room cannot be joined.
3. **Publish scoping** — `screen_share` appears in `canPublishSources` only for
   the current slot holder, so a viewer's token cannot publish even if the
   client is modified.
4. **Expiry** — tokens are short-lived (`VOICE_TOKEN_TTL_SECONDS`, 600s) and
   leaving the table releases the slot immediately.

## Deliberately not implemented

`screen-share:participant-joined` / `participant-left` from spec §7. Seat
occupancy already broadcasts `seat:occupied` and `seat:released` to the
instance, and the client derives table membership from that. A parallel set of
viewer events would be a second membership system telling the same story, and
the brief says not to introduce duplicates. Worth revisiting only if the
publisher needs a viewer count, which no acceptance criterion asks for.

## Verified vs not verified

Proven by tests: the authorisation rules, the ten-state derivation, when a
transport should exist, the REST and socket boundaries, and the audit trail.

Proven by running it: the server boots, routes and handlers register, the
unseated refusal returns the right code over both HTTP and the socket, and
16/16 smoke checks pass.

**Now proven: a screen actually appearing on another person's screen.**
`npm run screen-share` walks three guests to real seats, starts a share over
the REST endpoint the web app uses, and checks who hears about it; then it
opens a headless browser, publishes with the publisher's own token and
subscribes with the viewer's, and asserts live frames arrive. The source
picker itself is stood in for by a painted canvas — the picker is the
browser's and not ours to test — but everything downstream of it now runs on
every check.

Running that for the first time found the feature broken outright, in two
places:

1. **The REST door announced nothing.** `start` and `stop` claimed and
   released the slot without telling the table, while the socket door did.
   The web app uses REST, so no viewer ever learned to join the screen room,
   and the publisher's own client — seeing no session in its store — decided
   `needsScreenRoom` was false and disconnected the track it had just
   published. Both doors now announce through `ScreenShareService`, so
   neither caller can forget.
2. **The publisher never saw their own screen.** LiveKit fires
   `TrackSubscribed` for remote tracks only, so the one person certain to be
   looking got "Đang chờ màn hình…" over a black rectangle for the whole
   share. `ScreenShareClient` now adopts the local track from
   `LocalTrackPublished` as well.
