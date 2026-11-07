'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_PRESETS,
  CLIENT_EVENTS,
  HEARTBEAT_INTERVAL_MS,
  ModerationReason,
  PlayerStatus,
  SERVER_EVENTS,
  STORAGE_KEYS,
  normaliseDisplayName,
  type ScreenShareFailedEvent,
  type ScreenShareStartedEvent,
} from '@virtual-cafe/shared';
import { CafeAudioEngine } from '@/audio/engine';
import { CafeEngine } from '@/game/engine';
import { ApiError, api } from '@/lib/api';
import { createSocket, type Socket } from '@/lib/socket';
import { planSessionBootstrap } from '@/lib/sessionPlan';
import { readLocal, writeLocal } from '@/lib/storage';
import { useCafeStore } from '@/state/useCafeStore';
import { VoiceClient } from '@/voice/voiceClient';
import { startAmbience } from '@/world/ambience';
import {
  SCREEN_STEP_LABEL,
  classifyScreenShareError,
  deriveScreenShareView,
  isScreenShareSupported,
  needsScreenRoom,
} from '@/voice/screenShareState';
import { ScreenShareClient } from '@/voice/screenShareClient';
import { voiceConnectionOutlivedSeat, voiceGroupOfSeat } from '@/voice/voiceEntitlement';

interface StoredSession {
  token: string;
  userId: string;
}

/**
 * Owns the café session: HTTP handshake, realtime socket, the world engine,
 * the soundscape and the voice client. React components stay declarative and
 * read from the store; everything stateful lives behind this hook.
 */
export function useCafe() {
  const socketRef = useRef<Socket | null>(null);
  const engineRef = useRef<CafeEngine | null>(null);
  const audioRef = useRef<CafeAudioEngine | null>(null);
  const voiceRef = useRef<VoiceClient | null>(null);
  /** The table the open voice room belongs to, or null when none is open. */
  const voiceGroupRef = useRef<string | null>(null);
  const screenRef = useRef<ScreenShareClient | null>(null);
  const [screenVideo, setScreenVideo] = useState<HTMLVideoElement | null>(null);

  const store = useCafeStore;

  // ------------------------------------------------------------------ audio

  const ensureAudio = useCallback(async () => {
    const state = store.getState();
    if (!audioRef.current) audioRef.current = new CafeAudioEngine();
    try {
      await audioRef.current.start(state.audio);
      store.getState().setAudioStarted(true);
      store.getState().setAudioBlocked(false);
    } catch {
      store.getState().setAudioBlocked(true);
    }
  }, [store]);

  const playUi = useCallback((sound: Parameters<CafeAudioEngine['playUi']>[0]) => {
    audioRef.current?.playUi(sound);
  }, []);

  // ----------------------------------------------------------------- session

  useEffect(() => {
    // No "already started" guard: React runs effects twice in development, and
    // skipping the second run would leave the session torn down by the first
    // cleanup. Instead every resource is released below, and a session that
    // finishes connecting after unmount closes itself.
    let cancelled = false;
    let heartbeat: number | null = null;

    const connect = async () => {
      const set = store.getState();
      set.setPhase('authenticating');

      // Reuse the guest session so a refresh does not create a new person.
      const stored = readLocal<StoredSession>(STORAGE_KEYS.session, { token: '', userId: '' });
      let token = stored.token;
      try {
        let currentName: string | null = null;
        let avatar = null as Awaited<ReturnType<typeof api.me>>['avatar'] | null;
        if (token) {
          const me = await api.me(token).catch(() => null);
          if (me) {
            currentName = me.displayName;
            avatar = me.avatar;
          } else {
            token = '';
          }
        }

        const pending = readLocal(STORAGE_KEYS.pendingName, { name: '' });
        const plan = planSessionBootstrap({
          hasToken: Boolean(token),
          pendingName: pending.name,
          currentName,
        });

        if (plan.action === 'refuse') {
          // No name and no existing session: do not mint one. Redirecting the
          // view is not enough — arriving straight at /cafe used to create a
          // nameless guest before the redirect could fire.
          set.setPhase('idle');
          return;
        }

        if (plan.action === 'create') {
          const session = await api.createGuest(plan.name);
          token = session.token;
          writeLocal(STORAGE_KEYS.session, { token: session.token, userId: session.userId });
          store.getState().setSession(session);
        } else {
          // Returning with a session. Two things used to go wrong here and
          // both were invisible until someone used it: the name just typed at
          // the door was ignored, and the session never reached the store, so
          // anything reading it — Share Screen among them — silently did
          // nothing.
          if (plan.action === 'rename') {
            const updated = await api.updateProfile(token, { displayName: plan.name });
            currentName = updated.displayName;
            avatar = updated.avatar;
          }
          store.getState().setSession({
            token,
            userId: stored.userId,
            displayName: currentName ?? '',
            avatar: avatar ?? { presetId: AVATAR_PRESETS[0].id },
            expiresAt: 0,
          });
        }
        await api.joinCafe(token);
        const blocks = await api.blocks(token).catch(() => ({ blocked: [] as string[] }));
        store.getState().setBlockedUsers(blocks.blocked);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Hiện chưa kết nối được tới quán.';
        store.getState().setPhase('error', message);
        return;
      }
      if (cancelled) return;

      store.getState().setPhase('connecting');
      const socket = createSocket(token);
      if (cancelled) {
        // Unmounted while the handshake was in flight.
        socket.disconnect();
        return;
      }
      socketRef.current = socket;

      const engine = new CafeEngine(socket, {
        onPresenceTick: ({ self, nearbySeatId }) => {
          const current = store.getState();
          current.setSelfPosition(self.x, self.y);
          current.setNearbySeat(nearbySeatId);
        },
        onSnapshot: (snapshot) => {
          store.getState().applySnapshot({
            instanceId: snapshot.instanceId,
            capacity: snapshot.capacity,
            self: snapshot.self,
            players: snapshot.players,
            npcs: snapshot.npcs,
            seats: snapshot.seats,
            voiceAvailable: snapshot.voiceAvailable,
          });
          if (!snapshot.voiceAvailable) store.getState().setVoicePhase('unavailable');
          playUi('join');
        },
        onPlayerJoined: (player) => store.getState().upsertPlayer(player),
        onPlayerLeft: (userId) => store.getState().removePlayer(userId),
        onPlayerState: (payload) => store.getState().patchPlayerState(payload),
        onSeatChange: (seatId, userId) => store.getState().setSeatOwner(seatId, userId),
        onVoiceGroup: (groupId, members) => store.getState().setVoiceGroup(groupId, members),
        onChat: (message) => store.getState().pushChat(message),
        onError: (message, code) => {
          store.getState().showToast(message, code === 'rate_limited' ? 'info' : 'error');
          playUi('error');
        },
      });
      engineRef.current = engine;

      socket.on(SERVER_EVENTS.screenShareStarted, (payload: ScreenShareStartedEvent) => {
        store.getState().setScreenShare({
          id: payload.sessionId,
          groupId: payload.groupId,
          publisherId: payload.publisherId,
          publisherName: payload.publisherName,
          startedAt: payload.startedAt,
        });
      });

      socket.on(SERVER_EVENTS.screenShareStopped, () => {
        const state = store.getState();
        state.setScreenShare(null);
        state.setScreenShareLocal('none');
      });

      socket.on(SERVER_EVENTS.screenShareFailed, (payload: ScreenShareFailedEvent) => {
        store.getState().setScreenShareLocal('none');
        store.getState().showToast(payload.message, 'error');
      });

      socket.on('connect', () => {
        socket.emit(CLIENT_EVENTS.worldJoin, {});
        // Ask for state rather than waiting for an event: a session may have
        // started before we connected, or while we were reconnecting.
        socket.emit(CLIENT_EVENTS.screenShareRequestState, {});
      });
      socket.io.on('reconnect_attempt', () => {
        store.getState().setPhase('reconnecting', 'Đang kết nối lại tới quán…');
      });
      socket.on('disconnect', (reason: string) => {
        if (reason === 'io client disconnect') return;
        store.getState().setPhase('reconnecting', 'Mất kết nối — đang kết nối lại…');
        // A dropped socket also drops voice; the mic never comes back by itself.
        void voiceRef.current?.disconnect();
        store.getState().setMic(false);
        store.getState().setVoicePhase(store.getState().voiceAvailable ? 'off' : 'unavailable');
      });
      socket.on('connect_error', (error: Error) => {
        store.getState().setPhase('reconnecting', error.message || 'Không kết nối được tới quán');
      });

      heartbeat = window.setInterval(() => {
        socket.emit(CLIENT_EVENTS.ping, {});
      }, HEARTBEAT_INTERVAL_MS);
    };

    void connect();

    return () => {
      cancelled = true;
      if (heartbeat !== null) window.clearInterval(heartbeat);
      socketRef.current?.disconnect();
      socketRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      void voiceRef.current?.disconnect();
      voiceRef.current = null;
      void audioRef.current?.dispose();
      audioRef.current = null;
      store.getState().setAudioStarted(false);
    };
  }, [playUi, store]);

  // Real-world time and weather drive the window, the lighting and the rain.
  useEffect(
    () =>
      startAmbience((ambience) => {
        store.getState().setAmbience(ambience);
        audioRef.current?.setWeatherIntensity(ambience.live ? ambience.rain : 1);
      }),
    [store],
  );

  // Keep the soundscape in step with the controls.
  useEffect(() =>
    store.subscribe((state) => {
      audioRef.current?.applySettings(state.audio);
      if (state.ambience) {
        audioRef.current?.setWeatherIntensity(state.ambience.live ? state.ambience.rain : 1);
      }
      voiceRef.current?.setVolume(audioRef.current?.voiceVolume() ?? state.audio.voice);
      engineRef.current?.setReducedMotion(state.audio.reducedMotion);
      void voiceRef.current?.setNoiseCancellation(state.audio.noiseCancellation ?? true);
      engineRef.current?.setMutedUsers(state.mutedUsers);
    }),
  [store]);

  // ----------------------------------------------------------------- actions

  const setStatus = useCallback(
    (status: PlayerStatus) => {
      socketRef.current?.emit(CLIENT_EVENTS.playerState, { status });
    },
    [],
  );

  const sit = useCallback(
    (seatId?: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (seatId) engine.sit(seatId);
      else engine.sitNearby();
      playUi('sit');
    },
    [playUi],
  );

  const stand = useCallback(() => {
    engineRef.current?.stand();
    playUi('stand');
  }, [playUi]);

  /**
   * Close the voice room and put the UI back to "not in a conversation".
   *
   * Shared by every exit so none of them can forget a step: leaving the room
   * open is what let a conversation be overheard after its table was left,
   * and leaving `voicePhase` at 'connected' is what left the microphone
   * toggle live for a table the person is no longer at.
   */
  const dropVoice = useCallback(async () => {
    voiceGroupRef.current = null;
    await voiceRef.current?.disconnect();
    const state = store.getState();
    state.setVoicePhase('off');
    state.setMic(false);
    state.setVoiceGroup(null, []);
  }, [store]);

  const joinVoice = useCallback(async () => {
    const state = store.getState();
    if (!state.voiceAvailable) {
      state.showToast('Máy chủ này chưa cấu hình tính năng giọng nói.', 'error');
      return;
    }
    // The table being joined, read before the first await so that a seat
    // given up mid-join is noticed rather than papered over.
    const joiningGroup = voiceGroupOfSeat(state.self?.seatId);
    state.setVoicePhase('connecting');
    socketRef.current?.emit(CLIENT_EVENTS.voiceJoin, {});

    const stored = readLocal<StoredSession>(STORAGE_KEYS.session, { token: '', userId: '' });
    try {
      const result = await api.voiceToken(stored.token);
      if (!result.token || !result.url) {
        store.getState().setVoicePhase('error');
        store.getState().showToast(result.reason ?? 'Hiện chưa dùng được giọng nói.', 'error');
        return;
      }
      if (!voiceRef.current) {
        voiceRef.current = new VoiceClient({
          onConnected: () => store.getState().setVoicePhase('connected'),
          onDisconnected: () => {
            store.getState().setVoicePhase('off');
            store.getState().setMic(false);
            store.getState().setNoiseCancellationMode(null);
          },
          onNoiseCancellationChange: (mode) => store.getState().setNoiseCancellationMode(mode),
          onError: (message) => {
            store.getState().setVoicePhase('error');
            store.getState().showToast(message, 'error');
          },
          onSpeakingChange: () => undefined,
        });
      }
      await voiceRef.current.setNoiseCancellation(store.getState().audio.noiseCancellation ?? true);
      await voiceRef.current.connect(result.url, result.token);
      voiceGroupRef.current = joiningGroup;

      // The token request and the SFU handshake are two awaits long, and a
      // seat can be given up inside them. The watcher below only fires on a
      // seat change, so a seat that changed before the room existed would
      // leave it open; this catches exactly that window.
      if (voiceConnectionOutlivedSeat(joiningGroup, store.getState().self?.seatId)) {
        await dropVoice();
        return;
      }

      voiceRef.current.setVolume(audioRef.current?.voiceVolume() ?? 1);
      for (const muted of store.getState().mutedUsers) {
        voiceRef.current.setParticipantMuted(muted, true);
      }
      socketRef.current?.emit(CLIENT_EVENTS.voiceState, { micOn: false, connected: true });
    } catch (error) {
      store.getState().setVoicePhase('error');
      store
        .getState()
        .showToast(error instanceof Error ? error.message : 'Không thể tham gia cuộc trò chuyện.', 'error');
    }
  }, [dropVoice, store]);

  const leaveVoice = useCallback(async () => {
    socketRef.current?.emit(CLIENT_EVENTS.voiceLeave, {});
    await dropVoice();
    playUi('mic_off');
  }, [dropVoice, playUi]);

  /** The microphone only ever changes on an explicit action (SPEC 14.2). */
  const toggleMic = useCallback(async () => {
    const state = store.getState();
    if (state.voicePhase !== 'connected' || !voiceRef.current) {
      state.showToast('Hãy tham gia cuộc trò chuyện tại bàn của bạn trước.', 'info');
      return;
    }
    const next = !state.micOn;
    try {
      await voiceRef.current.setMicrophoneEnabled(next);
      store.getState().setMic(next);
      socketRef.current?.emit(CLIENT_EVENTS.voiceState, { micOn: next, connected: true });
      playUi(next ? 'mic_on' : 'mic_off');
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Trình duyệt đã chặn quyền truy cập micro. Hãy cho phép ở thanh địa chỉ rồi thử lại.'
          : 'Không thể bật micro.';
      store.getState().setMic(false, message);
      store.getState().showToast(message, 'error');
      playUi('error');
    }
  }, [playUi, store]);

  const sendChat = useCallback((body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    socketRef.current?.emit(CLIENT_EVENTS.chatSend, { body: trimmed });
  }, []);

  const muteUser = useCallback(
    (userId: string) => {
      store.getState().toggleMuteUser(userId);
      const muted = store.getState().mutedUsers.includes(userId);
      voiceRef.current?.setParticipantMuted(userId, muted);
    },
    [store],
  );

  const blockUser = useCallback(
    async (userId: string) => {
      const stored = readLocal<StoredSession>(STORAGE_KEYS.session, { token: '', userId: '' });
      try {
        await api.block(stored.token, userId);
        store.getState().addBlockedUser(userId);
        if (!store.getState().mutedUsers.includes(userId)) muteUser(userId);
        store.getState().showToast('Đã chặn. Bạn sẽ không nghe hay đọc được người này nữa.');
      } catch {
        store.getState().showToast('Không thể chặn người này.', 'error');
      }
    },
    [muteUser, store],
  );

  const reportUser = useCallback(
    async (userId: string, reason: ModerationReason, details?: string) => {
      const stored = readLocal<StoredSession>(STORAGE_KEYS.session, { token: '', userId: '' });
      try {
        await api.report(stored.token, { reportedUserId: userId, reason, details });
        store.getState().showToast('Đã gửi báo cáo. Cảm ơn bạn.');
      } catch {
        store.getState().showToast('Không gửi được báo cáo.', 'error');
      }
    },
    [store],
  );

  const leaveCafe = useCallback(async () => {
    const stored = readLocal<StoredSession>(STORAGE_KEYS.session, { token: '', userId: '' });
    socketRef.current?.emit(CLIENT_EVENTS.worldLeave, {});
    await voiceRef.current?.disconnect();
    await api.leaveCafe(stored.token).catch(() => undefined);
    socketRef.current?.disconnect();
    await audioRef.current?.dispose();
    store.getState().reset();
  }, [store]);

  /**
   * Create the transport on first use and reuse it afterwards, so a second
   * viewer event cannot open a duplicate subscription to the same room.
   */
  const ensureScreenClient = useCallback((): ScreenShareClient => {
    if (screenRef.current) return screenRef.current;
    const client = new ScreenShareClient({
      onTrack: (element) => setScreenVideo(element),
      onTrackGone: () => setScreenVideo(null),
      onLocalCaptureEnded: () => {
        // The browser's own "Stop sharing" button ends capture without
        // touching our UI, so the session has to be released from here or the
        // table would be left believing a dead share is still running.
        const session = store.getState().session;
        void screenRef.current?.disconnect();
        setScreenVideo(null);
        const state = store.getState();
        state.setScreenShare(null);
        state.setScreenShareLocal('none');
        if (session) void api.screenShareStop(session.token).catch(() => undefined);
      },
      onDisconnected: () => setScreenVideo(null),
      onReconnecting: () => store.getState().setScreenShareLocal('reconnecting'),
      onReconnected: () => store.getState().setScreenShareLocal('none'),
    });
    screenRef.current = client;
    return client;
  }, []);

  /**
   * Start sharing.
   *
   * The slot is claimed before the picker opens, because LiveKit can only
   * open the picker through a room it is already connected to. That means a
   * cancelled picker leaves a claimed slot for a moment, so every failure
   * path below releases it — otherwise one abandoned attempt would block the
   * whole table.
   *
   * Each step is labelled. A failure anywhere used to collapse into one
   * message, which made a report of "it did not work" impossible to act on.
   */
  const startScreenShare = useCallback(async () => {
    const state = store.getState();
    const session = state.session;
    if (!session) {
      // This used to return silently, so a returning visitor — whose session
      // was never put in the store — pressed Share Screen and nothing at all
      // happened. The store is populated on both paths now, but a button that
      // does nothing without saying why is never acceptable.
      state.showToast('Chưa sẵn sàng chia sẻ màn hình. Hãy tải lại trang.', 'error');
      return;
    }

    if (!isScreenShareSupported(globalThis.navigator?.mediaDevices)) {
      state.showToast('Trình duyệt này không hỗ trợ chia sẻ màn hình', 'error');
      return;
    }

    state.setScreenShareLocal('selecting');
    let step: 'claim' | 'token' | 'connect' | 'publish' = 'claim';
    try {
      const claimed = await api.screenShareStart(session.token);
      if (!claimed.active) {
        state.setScreenShareLocal('none');
        state.showToast(claimed.reason ?? 'Không thể chia sẻ màn hình', 'error');
        return;
      }

      step = 'token';
      state.setScreenShareLocal('connecting');
      const grant = await api.screenShareToken(session.token);
      if (!grant.token || !grant.url) {
        throw new Error(grant.reason ?? 'Không lấy được quyền chia sẻ màn hình');
      }

      step = 'connect';
      const client = ensureScreenClient();
      await client.connect(grant.url, grant.token);

      step = 'publish';
      await client.startPublishing();
      store.getState().setScreenShareLocal('none');
    } catch (error) {
      // Name the step in the console so a report of "it did not work" can be
      // traced to the hop that actually failed.
      console.error(`[screen-share] failed while ${step}`, error);
      // A cancelled picker, a refused permission and a dead transport all
      // land here and deserve different treatment. Whatever it was, release
      // the slot so an attempt that never began cannot block the table.
      const failure = classifyScreenShareError(error);
      store.getState().setScreenShareLocal(failure.local);
      if (failure.toast) {
        store.getState().showToast(`${SCREEN_STEP_LABEL[step]}: ${failure.message}`, 'error');
      }
      await api.screenShareStop(session.token).catch(() => undefined);
      await screenRef.current?.disconnect();
      setScreenVideo(null);
    }
  }, [ensureScreenClient]);

  /**
   * Keep the transport in step with what the view says.
   *
   * Viewers never call connect explicitly: when the server says a session
   * exists at their table they join, and when it ends — or they stand up —
   * they drop. Driving it from `needsScreenRoom` means the subscription can
   * never outlive the entitlement that justified it.
   */
  const screenSession = useCafeStore((state) => state.screenShare);
  const screenLocal = useCafeStore((state) => state.screenShareLocal);
  const selfSeatId = useCafeStore((state) => state.self?.seatId ?? null);
  const selfUserId = useCafeStore((state) => state.self?.userId ?? null);

  /**
   * A voice room never outlives the seat that justified it.
   *
   * Standing up ends the entitlement on the server, which drops the
   * membership and tells everyone — but the SFU room is this browser's, and
   * no presence update closes it. Until it is closed the audio keeps
   * arriving, so someone who stood up and walked away could still hear the
   * table, and with `voicePhase` still 'connected' could still switch their
   * microphone on and talk into it.
   *
   * Watching the seat rather than the stand button covers every way of
   * leaving a table: the button, tapping a chair at another table (which
   * never passes through "standing" at all), and a correction the server
   * makes on its own.
   */
  useEffect(() => {
    if (!voiceConnectionOutlivedSeat(voiceGroupRef.current, selfSeatId)) return;
    void dropVoice();
  }, [dropVoice, selfSeatId]);

  useEffect(() => {
    const view = deriveScreenShareView({
      session: screenSession,
      selfId: selfUserId,
      seated: Boolean(selfSeatId),
      local: screenLocal,
    });

    // The layout is derived from the same view as the transport, and from
    // here rather than from the panel: a share going live has to take the
    // interface over even when the side panels are closed and the panel
    // itself is not mounted to notice.
    store.getState().syncScreenShareFocus(view.phase);

    if (!needsScreenRoom(view)) {
      if (screenRef.current?.isConnected) {
        void screenRef.current.disconnect();
        setScreenVideo(null);
      }
      return;
    }

    // The publisher already connected in startScreenShare.
    if (view.isPublisher || screenRef.current?.isConnected) return;

    const session = store.getState().session;
    if (!session) return;
    let cancelled = false;

    void (async () => {
      try {
        const grant = await api.screenShareToken(session.token);
        if (cancelled || !grant.token || !grant.url) return;
        await ensureScreenClient().connect(grant.url, grant.token);
      } catch {
        if (!cancelled) store.getState().setScreenShareLocal('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screenSession, screenLocal, selfSeatId, selfUserId, ensureScreenClient]);

  const stopScreenShare = useCallback(async () => {
    const session = store.getState().session;
    await screenRef.current?.stopPublishing().catch(() => undefined);
    await screenRef.current?.disconnect();
    setScreenVideo(null);
    if (session) await api.screenShareStop(session.token).catch(() => undefined);
    const state = store.getState();
    state.setScreenShare(null);
    state.setScreenShareLocal('none');
  }, []);

  return {
    engineRef,
    screenVideo,
    startScreenShare,
    stopScreenShare,
    ensureAudio,
    playUi,
    setStatus,
    sit,
    stand,
    joinVoice,
    leaveVoice,
    toggleMic,
    sendChat,
    muteUser,
    blockUser,
    reportUser,
    leaveCafe,
  };
}

export type CafeControls = ReturnType<typeof useCafe>;
