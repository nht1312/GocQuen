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
    getTrackPublication: (source: string) => { track?: MicTrackLike } | undefined;
  };
};

type MicTrackLike = {
  setProcessor: (processor: unknown) => Promise<void>;
  stopProcessor: () => Promise<void>;
  getProcessor: () => unknown;
};

type KrispProcessorLike = { setEnabled: (enabled: boolean) => Promise<unknown> | unknown };

/**
 * 'enhanced' = Krisp model running on our microphone (LiveKit Cloud only).
 * 'standard' = the browser's own WebRTC noise suppression, always on.
 * 'off'      = the user switched enhanced off; standard still applies.
 */
export type NoiseCancellationMode = 'enhanced' | 'standard' | 'off';

export interface VoiceClientCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
  onSpeakingChange: (identities: string[]) => void;
  onNoiseCancellationChange?: (mode: NoiseCancellationMode) => void;
}

export class VoiceClient {
  private room: RoomLike | null = null;
  private audios: RemoteAudio[] = [];
  private volume = 1;
  private muted = new Set<string>();
  private container: HTMLElement | null = null;
  private noiseCancellation = true;
  private krisp: KrispProcessorLike | null = null;
  private micSource = 'microphone';

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

    this.micSource = livekit.Track.Source.Microphone;
    await room.connect(url, token);
    this.room = room;
    this.callbacks.onConnected();
  }

  /** The microphone is only ever enabled by an explicit user action. */
  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room) throw new Error('Chưa kết nối tới kênh thoại');
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
    if (enabled) await this.applyNoiseCancellation();
  }

  /**
   * Enhanced noise cancellation (docs.livekit.io/transport/media/noise-cancellation).
   * Filters only what *we* send. WebRTC noiseSuppression/echoCancellation stay
   * on underneath, so switching this off never leaves the mic raw.
   */
  async setNoiseCancellation(enabled: boolean): Promise<void> {
    if (this.noiseCancellation === enabled) return;
    this.noiseCancellation = enabled;
    await this.applyNoiseCancellation();
  }

  private async applyNoiseCancellation(): Promise<void> {
    const track = this.room?.localParticipant.getTrackPublication(this.micSource)?.track;
    if (!track) return;
    const report = this.callbacks.onNoiseCancellationChange ?? (() => undefined);
    if (!this.noiseCancellation) {
      if (this.krisp) await this.krisp.setEnabled(false);
      report('off');
      return;
    }
    try {
      if (this.krisp && track.getProcessor() === this.krisp) {
        await this.krisp.setEnabled(true);
        report('enhanced');
        return;
      }
      const krispModule = await import('@livekit/krisp-noise-filter');
      if (!krispModule.isKrispNoiseFilterSupported()) {
        report('standard');
        return;
      }
      const processor = krispModule.KrispNoiseFilter();
      await track.setProcessor(processor);
      await processor.setEnabled(true);
      this.krisp = processor as KrispProcessorLike;
      report('enhanced');
    } catch (error) {
      // Package missing, unsupported browser, or not a LiveKit Cloud project.
      console.warn('[voice] enhanced noise cancellation unavailable', error);
      this.krisp = null;
      await track.stopProcessor().catch(() => undefined);
      report('standard');
    }
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
    this.krisp = null;
    const room = this.room;
    this.room = null;
    await room?.disconnect().catch(() => undefined);
  }
}
