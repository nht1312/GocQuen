'use client';

import { create } from 'zustand';
import {
  SCREEN_FOCUS_OFF,
  chooseScreenShareFocus,
  nextScreenShareFocus,
} from '@/voice/screenShareState';
import type {
  LocalScreenShareState,
  ScreenShareFocus,
  ScreenSharePhase,
} from '@/voice/screenShareState';
import {
  AudioSettings,
  ChatMessage,
  DEFAULT_AUDIO_SETTINGS,
  GuestSession,
  NpcPresence,
  PlayerPresence,
  PlayerStatus,
  ScreenShareSessionInfo,
  STORAGE_KEYS,
  zoneLabelAt,
} from '@virtual-cafe/shared';
import { readLocal, writeLocal } from '@/lib/storage';
import type { NoiseCancellationMode } from '@/voice/voiceClient';
import type { WorldAmbience } from '@/world/ambience';
import type { PersonalSource } from '@/audio/personalMusic';
import type { CatReaction } from '@/game/cats';

export type ConnectionPhase =
  | 'idle'
  | 'authenticating'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type VoicePhase = 'off' | 'connecting' | 'connected' | 'unavailable' | 'error';

export interface PersonRow {
  userId: string;
  displayName: string;
  status: PlayerStatus;
  zone: string;
  micOn: boolean;
  inVoiceGroup: boolean;
  isSelf: boolean;
  isNpc: boolean;
  muted: boolean;
}

interface CafeState {
  phase: ConnectionPhase;
  connectionMessage: string | null;
  session: GuestSession | null;
  instanceId: string | null;
  capacity: number;

  self: PlayerPresence | null;
  players: Record<string, PlayerPresence>;
  npcs: NpcPresence[];
  seatOwners: Record<string, string | null>;

  voiceAvailable: boolean;
  voicePhase: VoicePhase;
  /** The session the server says exists at our table, or null. */
  screenShare: ScreenShareSessionInfo | null;
  /** What this browser is doing, which the server cannot know. */
  screenShareLocal: LocalScreenShareState;
  /** Whether the shared screen has taken the café over, and who decided. */
  screenShareFocus: ScreenShareFocus;
  voiceGroupId: string | null;
  voiceMembers: string[];
  micOn: boolean;
  micError: string | null;
  noiseCancellationMode: NoiseCancellationMode | null;
  /** Real-world time and weather outside the café window. */
  ambience: WorldAmbience | null;
  /** Focus Mode music from a link this listener pasted. Never leaves the browser. */
  personalMusic: { source: PersonalSource; label: string } | null;
  /** A café cat is within reach: what F would do to it. */
  nearbyCat: CatReaction | null;

  chat: ChatMessage[];
  unreadChat: number;
  chatOpen: boolean;

  audio: AudioSettings;
  audioStarted: boolean;
  audioBlocked: boolean;

  mutedUsers: string[];
  blockedUsers: string[];

  nearbySeatId: string | null;
  toast: { id: number; message: string; tone: 'info' | 'error' } | null;

  setPhase: (phase: ConnectionPhase, message?: string | null) => void;
  setSession: (session: GuestSession | null) => void;
  applySnapshot: (payload: {
    instanceId: string;
    capacity: number;
    self: PlayerPresence;
    players: PlayerPresence[];
    npcs: NpcPresence[];
    seats: Array<{ seatId: string; userId: string | null }>;
    voiceAvailable: boolean;
  }) => void;
  upsertPlayer: (player: PlayerPresence) => void;
  removePlayer: (userId: string) => void;
  patchPlayerState: (payload: {
    userId: string;
    status: PlayerStatus;
    seatId: string | null;
    voice: PlayerPresence['voice'];
  }) => void;
  setSeatOwner: (seatId: string, userId: string | null) => void;
  setSelfPosition: (x: number, y: number) => void;
  setNearbySeat: (seatId: string | null) => void;

  setVoicePhase: (phase: VoicePhase) => void;
  setScreenShare: (session: ScreenShareSessionInfo | null) => void;
  setScreenShareLocal: (local: LocalScreenShareState) => void;
  /** Apply the automatic rule for a phase; a deliberate choice outranks it. */
  syncScreenShareFocus: (phase: ScreenSharePhase) => void;
  setScreenShareFocus: (focused: boolean) => void;
  setVoiceGroup: (groupId: string | null, members: string[]) => void;
  setMic: (on: boolean, error?: string | null) => void;
  setNoiseCancellationMode: (mode: NoiseCancellationMode | null) => void;
  setAmbience: (ambience: WorldAmbience) => void;
  setPersonalMusic: (music: { source: PersonalSource; label: string } | null) => void;
  setNearbyCat: (cat: CatReaction | null) => void;

  pushChat: (message: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;

  updateAudio: (patch: Partial<AudioSettings>) => void;
  setAudioStarted: (started: boolean) => void;
  setAudioBlocked: (blocked: boolean) => void;

  toggleMuteUser: (userId: string) => void;
  setBlockedUsers: (users: string[]) => void;
  addBlockedUser: (userId: string) => void;

  showToast: (message: string, tone?: 'info' | 'error') => void;
  dismissToast: () => void;

  people: () => PersonRow[];
  reset: () => void;
}

const initialAudio = (): AudioSettings => ({
  ...readLocal<AudioSettings>(STORAGE_KEYS.audio, { ...DEFAULT_AUDIO_SETTINGS }),
  // Focus now follows the "Cần tập trung" status, not a stored switch.
  focusMode: false,
});

export const useCafeStore = create<CafeState>((set, get) => ({
  phase: 'idle',
  connectionMessage: null,
  session: null,
  instanceId: null,
  capacity: 25,

  self: null,
  players: {},
  npcs: [],
  seatOwners: {},

  voiceAvailable: false,
  voicePhase: 'off',
  screenShare: null,
  screenShareLocal: 'none',
  screenShareFocus: SCREEN_FOCUS_OFF,
  voiceGroupId: null,
  voiceMembers: [],
  micOn: false,
  micError: null,
  noiseCancellationMode: null,
  ambience: null,
  personalMusic: null,
  nearbyCat: null,

  chat: [],
  unreadChat: 0,
  chatOpen: false,

  audio: initialAudio(),
  audioStarted: false,
  audioBlocked: false,

  mutedUsers: [],
  blockedUsers: [],

  nearbySeatId: null,
  toast: null,

  setPhase: (phase, message = null) => set({ phase, connectionMessage: message }),
  setSession: (session) => set({ session }),

  applySnapshot: ({ instanceId, capacity, self, players, npcs, seats, voiceAvailable }) =>
    set({
      instanceId,
      capacity,
      self,
      npcs,
      voiceAvailable,
      players: Object.fromEntries(players.map((player) => [player.userId, player])),
      seatOwners: Object.fromEntries(seats.map((seat) => [seat.seatId, seat.userId])),
      phase: 'connected',
      connectionMessage: null,
    }),

  upsertPlayer: (player) =>
    set((state) =>
      player.userId === state.self?.userId
        ? { self: player }
        : { players: { ...state.players, [player.userId]: player } },
    ),

  removePlayer: (userId) =>
    set((state) => {
      const players = { ...state.players };
      delete players[userId];
      return { players };
    }),

  patchPlayerState: ({ userId, status, seatId, voice }) =>
    set((state) => {
      if (state.self?.userId === userId) {
        // Leaving "Cần tập trung", or the seat, ends the listener's own music.
        const keep = status === 'focus' && Boolean(seatId);
        return { self: { ...state.self, status, seatId, voice }, ...(keep ? {} : { personalMusic: null }) };
      }
      const existing = state.players[userId];
      if (!existing) return {};
      return { players: { ...state.players, [userId]: { ...existing, status, seatId, voice } } };
    }),

  setSeatOwner: (seatId, userId) =>
    set((state) => ({ seatOwners: { ...state.seatOwners, [seatId]: userId } })),

  setSelfPosition: (x, y) =>
    set((state) => (state.self ? { self: { ...state.self, x, y } } : {})),

  setNearbySeat: (seatId) =>
    set((state) => (state.nearbySeatId === seatId ? {} : { nearbySeatId: seatId })),

  setVoicePhase: (voicePhase) => set({ voicePhase }),
  setScreenShare: (screenShare) => set({ screenShare }),
  setScreenShareLocal: (screenShareLocal) => set({ screenShareLocal }),
  syncScreenShareFocus: (phase) =>
    set((state) => {
      const next = nextScreenShareFocus(state.screenShareFocus, phase);
      return next === state.screenShareFocus ? {} : { screenShareFocus: next };
    }),
  setScreenShareFocus: (focused) => set({ screenShareFocus: chooseScreenShareFocus(focused) }),
  setVoiceGroup: (voiceGroupId, voiceMembers) => set({ voiceGroupId, voiceMembers }),
  setMic: (micOn, micError = null) => set({ micOn, micError }),
  setNoiseCancellationMode: (noiseCancellationMode) => set({ noiseCancellationMode }),
  setAmbience: (ambience) => set({ ambience }),
  // Personal music belongs to the "Cần tập trung" status (see useCafe).
  setPersonalMusic: (personalMusic) => set({ personalMusic }),
  setNearbyCat: (nearbyCat) => set((state) => (state.nearbyCat === nearbyCat ? {} : { nearbyCat })),

  pushChat: (message) =>
    set((state) => ({
      chat: [...state.chat, message].slice(-100),
      unreadChat: state.chatOpen ? 0 : state.unreadChat + 1,
    })),

  setChatOpen: (chatOpen) => set({ chatOpen, unreadChat: chatOpen ? 0 : get().unreadChat }),

  updateAudio: (patch) =>
    set((state) => {
      const audio = { ...state.audio, ...patch };
      writeLocal(STORAGE_KEYS.audio, audio);
      return { audio };
    }),

  setAudioStarted: (audioStarted) => set({ audioStarted }),
  setAudioBlocked: (audioBlocked) => set({ audioBlocked }),

  toggleMuteUser: (userId) =>
    set((state) => {
      const muted = state.mutedUsers.includes(userId)
        ? state.mutedUsers.filter((id) => id !== userId)
        : [...state.mutedUsers, userId];
      writeLocal(STORAGE_KEYS.mutedUsers, muted);
      return { mutedUsers: muted };
    }),

  setBlockedUsers: (blockedUsers) => set({ blockedUsers }),
  addBlockedUser: (userId) =>
    set((state) => ({ blockedUsers: [...new Set([...state.blockedUsers, userId])] })),

  showToast: (message, tone = 'info') => set({ toast: { id: Date.now(), message, tone } }),
  dismissToast: () => set({ toast: null }),

  people: () => {
    const state = get();
    const rows: PersonRow[] = [];
    if (state.self) {
      rows.push({
        userId: state.self.userId,
        displayName: state.self.displayName,
        status: state.self.status,
        zone: zoneLabelAt(state.self.x, state.self.y),
        micOn: state.self.voice.micOn,
        inVoiceGroup: Boolean(state.self.voice.groupId),
        isSelf: true,
        isNpc: false,
        muted: false,
      });
    }
    for (const player of Object.values(state.players)) {
      rows.push({
        userId: player.userId,
        displayName: player.displayName,
        status: player.status,
        zone: zoneLabelAt(player.x, player.y),
        micOn: player.voice.micOn,
        inVoiceGroup: Boolean(player.voice.groupId),
        isSelf: false,
        isNpc: false,
        muted: state.mutedUsers.includes(player.userId),
      });
    }
    for (const npc of state.npcs) {
      rows.push({
        userId: npc.npcId,
        displayName: npc.displayName,
        status: 'working',
        zone: zoneLabelAt(npc.x, npc.y),
        micOn: false,
        inVoiceGroup: false,
        isSelf: false,
        isNpc: true,
        muted: false,
      });
    }
    return rows;
  },

  reset: () =>
    set({
      phase: 'idle',
      self: null,
      players: {},
      npcs: [],
      seatOwners: {},
      chat: [],
      voiceGroupId: null,
      voiceMembers: [],
      voicePhase: 'off',
      screenShare: null,
      screenShareLocal: 'none',
      screenShareFocus: SCREEN_FOCUS_OFF,
      micOn: false,
      instanceId: null,
    }),
}));
