'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  CLIENT_EVENTS,
  HEARTBEAT_INTERVAL_MS,
  ModerationReason,
  PlayerStatus,
  STORAGE_KEYS,
} from '@virtual-cafe/shared';
import { CafeAudioEngine } from '@/audio/engine';
import { CafeEngine } from '@/game/engine';
import { ApiError, api } from '@/lib/api';
import { createSocket, type Socket } from '@/lib/socket';
import { readLocal, writeLocal } from '@/lib/storage';
import { useCafeStore } from '@/state/useCafeStore';
import { VoiceClient } from '@/voice/voiceClient';

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
        if (token) {
          await api.me(token).catch(() => {
            token = '';
          });
        }
        if (!token) {
          const session = await api.createGuest();
          token = session.token;
          writeLocal(STORAGE_KEYS.session, { token: session.token, userId: session.userId });
          store.getState().setSession(session);
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

      socket.on('connect', () => {
        socket.emit(CLIENT_EVENTS.worldJoin, {});
      });
      socket.io.on('reconnect_attempt', () => {
        store.getState().setPhase('reconnecting', 'Reconnecting to the café…');
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

  // Keep the soundscape in step with the controls.
  useEffect(() =>
    store.subscribe((state) => {
      audioRef.current?.applySettings(state.audio);
      voiceRef.current?.setVolume(audioRef.current?.voiceVolume() ?? state.audio.voice);
      engineRef.current?.setReducedMotion(state.audio.reducedMotion);
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

  const joinVoice = useCallback(async () => {
    const state = store.getState();
    if (!state.voiceAvailable) {
      state.showToast('Máy chủ này chưa cấu hình tính năng giọng nói.', 'error');
      return;
    }
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
          },
          onError: (message) => {
            store.getState().setVoicePhase('error');
            store.getState().showToast(message, 'error');
          },
          onSpeakingChange: () => undefined,
        });
      }
      await voiceRef.current.connect(result.url, result.token);
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
  }, [store]);

  const leaveVoice = useCallback(async () => {
    socketRef.current?.emit(CLIENT_EVENTS.voiceLeave, {});
    await voiceRef.current?.disconnect();
    store.getState().setVoicePhase('off');
    store.getState().setMic(false);
    playUi('mic_off');
  }, [playUi, store]);

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

  return {
    engineRef,
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
