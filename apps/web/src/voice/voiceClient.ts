'use client';

/**
 * Live voice (SPEC 6.2, 6.3).
 *
 * The client never decides who it may hear: it connects to the room named in
 * the server-issued token, which is scoped to one table in one instance. There
 * is no "whole café" room to accidentally subscribe to.
 *
 * `livekit-client` is an optional dependency and is imported lazily, so a
 * deployment without an SFU still builds and runs — voice simply reports as
 * unavailable (SPEC 16.2).
 */

interface RemoteAudio {
  identity: string;
  element: HTMLAudioElement;
}

type RoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: unknown[]) => void) => RoomLike;
  localParticipant: {
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>;
  };
};

export interface VoiceClientCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
  onSpeakingChange: (identities: string[]) => void;
}

export class VoiceClient {
  private room: RoomLike | null = null;
  private audios: RemoteAudio[] = [];
  private volume = 1;
  private muted = new Set<string>();
  private container: HTMLElement | null = null;

  constructor(private readonly callbacks: VoiceClientCallbacks) {}

  get isConnected(): boolean {
    return this.room !== null;
  }

  private ensureContainer(): HTMLElement {
    if (this.container) return this.container;
    const element = document.createElement('div');
    element.id = 'virtual-cafe-voice';
    element.style.display = 'none';
    document.body.appendChild(element);
    this.container = element;
    return element;
  }

  async connect(url: string, token: string): Promise<void> {
    let livekit: typeof import('livekit-client');
    try {
      livekit = await import('livekit-client');
    } catch {
      throw new Error('Bản dựng này chưa cài đặt thành phần giọng nói');
    }

    const room = new livekit.Room({
      adaptiveStream: true,
      dynacast: true,
      // Voice only: no camera, no screen share in the MVP (SPEC 2.3).
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }) as unknown as RoomLike;

    room.on(livekit.RoomEvent.TrackSubscribed, (...args: unknown[]) => {
      const [track, , participant] = args as [
        { kind: string; attach: () => HTMLMediaElement },
        unknown,
        { identity: string },
      ];
      if (track.kind !== 'audio') return;
      const element = track.attach() as HTMLAudioElement;
      element.autoplay = true;
      element.dataset.identity = participant.identity;
      element.volume = this.muted.has(participant.identity) ? 0 : this.volume;
      this.ensureContainer().appendChild(element);
      this.audios.push({ identity: participant.identity, element });
    });

    room.on(livekit.RoomEvent.TrackUnsubscribed, (...args: unknown[]) => {
      const [track] = args as [{ detach: () => HTMLMediaElement[] }];
      for (const element of track.detach()) element.remove();
      this.audios = this.audios.filter((audio) => audio.element.isConnected);
    });

    room.on(livekit.RoomEvent.ActiveSpeakersChanged, (...args: unknown[]) => {
      const [speakers] = args as [Array<{ identity: string }>];
      this.callbacks.onSpeakingChange(speakers.map((speaker) => speaker.identity));
    });

    room.on(livekit.RoomEvent.Disconnected, () => {
      this.callbacks.onDisconnected();
    });

    await room.connect(url, token);
    this.room = room;
    this.callbacks.onConnected();
  }

  /** The microphone is only ever enabled by an explicit user action. */
  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room) throw new Error('Chưa kết nối tới kênh thoại');
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    for (const audio of this.audios) {
      audio.element.volume = this.muted.has(audio.identity) ? 0 : volume;
    }
  }

  /** Client-side mute of one person (SPEC 14.3). */
  setParticipantMuted(identity: string, muted: boolean): void {
    if (muted) this.muted.add(identity);
    else this.muted.delete(identity);
    this.setVolume(this.volume);
  }

  async disconnect(): Promise<void> {
    for (const audio of this.audios) audio.element.remove();
    this.audios = [];
    const room = this.room;
    this.room = null;
    await room?.disconnect().catch(() => undefined);
  }
}
