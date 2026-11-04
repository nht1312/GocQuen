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

### 3. Per-table LiveKit rooms already exist — no new rooms needed

The spec asks for "a separate LiveKit room for each table, server-controlled".
That is already how voice works: `cafe__<instanceId>__<groupId>`, built by
`VoiceService.roomName()` from the server's own seat state. Media isolation is
already structural: a token grants exactly one room, so another table's stream
is not merely hidden, it is unreachable. Screen share reuses this room.

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
- [x] **3. Token grant** — `screen_share` is added to `canPublishSources` only
      for the user holding the publisher slot; everyone else keeps
      `['microphone']`. *Done: 6 tests in `test/voice-token.spec.ts` that
      verify the signed grant, not the intent.*
- [x] **4. REST** — `GET /voice/screen-share` (state) and `POST` start/stop,
      rate limited per caller. *Done: 11 tests. No table id in any route.
      The seated cross-table check over real HTTP is deferred to task 10,
      where the smoke suite's pathfinding already exists.*
- [ ] **5. Socket events** — `screen-share:started|stopped|failed`, broadcast
      to the publisher's table only, never carrying tokens.
- [ ] **6. Persistence** — `screen_share_sessions` metadata through the
      existing `Store` abstraction; memory + Postgres + schema.sql.
- [ ] **7. Web client** — publish/subscribe via the LiveKit SDK, store state.
- [ ] **8. Web UI** — floating panel, focus mode, the ten required states.
- [ ] **9. Errors and reconnection** — the cases in spec §10.
- [ ] **10. Isolation tests** — cross-table access attempts in the smoke suite.
- [ ] **11. Docs** — README, and amend `Virtual_Cafe_SPEC_v1.0.md` §2.3.

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
