# Spec coverage

Maps `Virtual_Cafe_SPEC_v1.0.md` onto the implementation. Section numbers refer
to the spec.

## Functional requirements (§9)

| ID | Feature | Priority | Status | Where |
| --- | --- | --- | --- | --- |
| FR-001 | Enter Café as a guest | P0 | Done | `auth/session.service.ts`, `app/page.tsx` |
| FR-002 | Instance assignment | P0 | Done | `InstanceManager.assignInstance` |
| FR-003 | Isometric map | P0 | Done | `game/renderer.ts`, `shared/map.ts` |
| FR-004 | Avatar movement and sync | P0 | Done | `game/engine.ts`, `InstanceManager.move` |
| FR-005 | Collision | P0 | Done | `shared/map.ts` (`COLLISION_GRID`, `isWalkable`) |
| FR-006 | Realtime presence | P0 | Done | `realtime.gateway.ts` |
| FR-007 | Seat interaction | P0 | Done | `InstanceManager.sit` / `stand` |
| FR-008 | Work status | P0 | Done | `StatusBar.tsx`, `InstanceManager.setStatus` |
| FR-009 | Background music | P0 | Done (recorded `bgm.mp3`, synthesised fallback) | `audio/engine.ts` (`startBackgroundMusic`), `public/audio/bgm.mp3` |
| FR-010 | Café ambience | P0 | Done (synthesised) | `audio/engine.ts` |
| FR-011 | Audio controls | P0 | Done | `AudioDock.tsx` |
| FR-012 | Group voice | P0 | Done | `voice.service.ts`, `voice/voiceClient.ts` |
| FR-013 | Microphone consent | P0 | Done | `useCafe.toggleMic`, never auto-enabled |
| FR-014 | Reconnect | P0 | Done | grace period + `join()` reattach |
| FR-015 | Focus Mode | P1 | Done | `AudioDock.tsx`, `engine.applySettings` |
| FR-016 | Table text chat | P1 | Done | `ChatPanel.tsx`, `onChatSend` |
| FR-017 | Ambient NPCs | P1 | Partial | placed and labelled; no animation cycles yet |
| FR-018 | Avatar customisation | P2 | Not started | presets exist, no picker UI |
| FR-019 | Pomodoro | P2 | Not started | |
| FR-020 | Order counter | P2 | Not started | |
| FR-021 | Music requests | P2 | Not started | |
| EXT-WX | Live time and weather | Extension | Done | `world/ambience.ts` (Open-Meteo), `renderer.ts` (`drawEvening`, window sky), `audio/engine.ts` (`setWeatherIntensity`) |
| EXT-NC | Microphone noise cancellation | Extension | Done | `voice/voiceClient.ts` (`applyNoiseCancellation`), toggle in `AudioDock.tsx` |

EXT-NC is not in the v1.0 spec. Standard WebRTC suppression is always on;
enhanced Krisp filtering (LiveKit Cloud only) is on by default, can be switched
off by the user, and falls back to standard when unavailable.

## Acceptance criteria (§17.1)

Every item below is covered by an automated check.

| Criterion | Test |
| --- | --- |
| Guest enters the public café | smoke: guests land in an instance |
| Valid instance assignment | unit: fills an instance before opening another |
| Sees other avatars in the same instance | smoke: both guests share an instance |
| Movement and collision correct | unit: speed / collision / seated rejection |
| Two people cannot take one seat | unit + smoke: the seat race |
| Sit/stand updates in realtime | smoke: `seat:occupied` / `seat:released` |
| Working / Focus status shown | unit: status set and restored |
| Independent music and ambience volume | `audio/engine.ts` per-layer gain nodes |
| Microphone off by default | unit: voice join never enables the mic |
| Voice only reaches the permitted group | unit + smoke: group scoping |
| Can leave voice without leaving the café | `voiceLeave` keeps the seat |
| Reconnect leaves no ghost avatar or stuck seat | unit: grace expiry; smoke: reconnect |
| Other instances are invisible and inaudible | unit: cross-instance isolation |

## Privacy and security tests (§17.3)

| Criterion | How it is enforced |
| --- | --- |
| Cannot take someone else's voice token | Tokens are minted for the caller's session subject only |
| Cannot join a voice group without permission | Group comes from the server-held seat, requests are rejected |
| Cannot send events to another instance | The gateway derives the instance from the session; `instanceId` is never accepted from the client |
| Cannot win a seat by race condition | Single-threaded check-and-set in `sit()` |
| Block and mute work | Server filters chat delivery; the client mutes the audio element |
| Microphone does not resume after reconnect | `join()` clears voice state on reattach |
| No unintended recording | The voice grant sets `recorder: false`; nothing is persisted |
| Noise cancellation touches only your own audio | Krisp runs on the local microphone track only; remote audio and the screen-share room are not processed |

## Non-functional

| Area | Status |
| --- | --- |
| Performance (§16.1) | Floor pre-rendered; ~60 sorted drawables per frame; 15 Hz movement updates; audio scheduled with a look-ahead |
| Reliability (§16.2) | Heartbeat, timeout, grace period, seat release, voice failure does not block the café |
| Accessibility (§16.3) | Reduced motion (in-app and OS), labels and tooltips, status shown as glyph + text not colour alone, keyboard navigation for all panels, pinch zoom never capped |
| Responsive (§10.3) | Below `md` the side column becomes a bottom dock of four tabs with one sheet open at a time; walking and sitting have on-screen controls (`TouchControls`); the world zooms out to frame the room on a small viewport (`game/viewport.ts`); onboarding and the seat prompt name the control the device actually has; verified at phone, landscape and tablet widths by `tools/mobile-check.mjs` |
| Observability (§16.4) | Prometheus and JSON metrics, structured logs with request ids, no tokens or message bodies logged |
| Data model (§12) | `schema.sql` matches the spec's tables; realtime data is deliberately not persisted |
| API (§13) | All nine endpoints implemented, plus `/me/blocks`, `/health`, `/metrics` |

## Open decisions from §19

| Decision | Taken here | Reversible? |
| --- | --- | --- |
| Render engine | Canvas2D isometric renderer, not Phaser | Yes — the renderer is behind `CafeRenderer` |
| Voice SFU | LiveKit-compatible tokens, minted directly as JWTs | Yes — `VoiceService` is the only place that mints |
| Guest-only vs accounts | Guest-only, with `auth_provider` / `auth_subject` columns ready | Yes |
| Group invite codes | Not built; finding people via the people panel is enough at this size | Yes |
| Capacity per instance | 25, configurable, pending a load test | Yes |
| Art style | Illustrated 2.5D, warm and low-contrast | Yes |
| Noise cancellation | Krisp in the browser (`@livekit/krisp-noise-filter`), optional dependency, falls back to WebRTC suppression | Yes — the switch is in `AudioSettings` and the processor is set in one place |
| Background music source | Recorded loop `public/audio/bgm.mp3` when present, generative music otherwise; track licence must be cleared before public deploy (SPEC 15.4) | Yes — delete the file to return to synthesised music |
| Live weather source | Open-Meteo, no key, fixed café location from env; falls back to the rainy-afternoon scene; attribution required (CC BY 4.0) | Yes — `NEXT_PUBLIC_LIVE_WEATHER=0` |
| Weather in the MVP | Rain on the window is in, as its own audio and visual layer | Yes |
| Profile retention | Guests persist only a display name and avatar preset | Yes |
