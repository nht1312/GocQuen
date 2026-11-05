'use client';

/**
 * Screen sharing over LiveKit (feature spec §3, §11).
 *
 * This connects to the table's *screen* room, which is deliberately not the
 * voice room: a token for the voice room carries the right to hear everyone
 * at the table, and watching a shared screen must not quietly grant that.
 *
 * `livekit-client` is an optional dependency and imported lazily, matching
 * `voiceClient`, so a build without it still runs with the feature reported
 * as unavailable rather than failing to load.
 */

type TrackLike = {
  kind: string;
  source?: string;
  attach: () => HTMLMediaElement;
  detach: () => HTMLMediaElement[];
};

type RoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: unknown[]) => void) => RoomLike;
  localParticipant: {
    setScreenShareEnabled: (
      enabled: boolean,
      options?: { audio?: boolean },
    ) => Promise<unknown>;
  };
};

export interface ScreenShareClientCallbacks {
  /** A remote screen arrived; attach it to the panel. */
  onTrack: (element: HTMLVideoElement) => void;
  /** The remote screen went away. */
  onTrackGone: () => void;
  /** The publisher's own capture ended, e.g. via the browser's Stop button. */
  onLocalCaptureEnded: () => void;
  onDisconnected: () => void;
  onReconnecting: () => void;
  onReconnected: () => void;
}

export class ScreenShareClient {
  private room: RoomLike | null = null;
  private attached: HTMLVideoElement | null = null;

  constructor(private readonly callbacks: ScreenShareClientCallbacks) {}

  get isConnected(): boolean {
    return this.room !== null;
  }

  async connect(url: string, token: string): Promise<void> {
    if (this.room) return;

    let livekit: typeof import('livekit-client');
    try {
      livekit = await import('livekit-client');
    } catch {
      throw new Error('Bản dựng này chưa cài đặt thành phần chia sẻ màn hình');
    }

    const room = new livekit.Room({
      adaptiveStream: true,
      dynacast: true,
    }) as unknown as RoomLike;

    room.on(livekit.RoomEvent.TrackSubscribed, (...args: unknown[]) => {
      const [track] = args as [TrackLike];
      // Only one publisher per table, so the newest video is the screen.
      this.adopt(track);
    });

    // LiveKit only fires TrackSubscribed for *remote* tracks, so without this
    // the one person guaranteed to care — whoever is sharing — watched a
    // black rectangle that said "waiting for a screen" for as long as they
    // shared, with no way to tell a working share from a broken one.
    room.on(livekit.RoomEvent.LocalTrackPublished, (...args: unknown[]) => {
      const [publication] = args as [{ track?: TrackLike | null }];
      if (publication?.track) this.adopt(publication.track);
    });

    room.on(livekit.RoomEvent.TrackUnsubscribed, (...args: unknown[]) => {
      const [track] = args as [TrackLike];
      for (const element of track.detach()) element.remove();
      this.attached = null;
      this.callbacks.onTrackGone();
    });

    room.on(livekit.RoomEvent.LocalTrackUnpublished, () => {
      // Covers the browser's own "Stop sharing" button, which ends the
      // capture without going anywhere near our UI.
      this.detachCurrent();
      this.callbacks.onLocalCaptureEnded();
    });

    room.on(livekit.RoomEvent.Reconnecting, () => this.callbacks.onReconnecting());
    room.on(livekit.RoomEvent.Reconnected, () => this.callbacks.onReconnected());
    room.on(livekit.RoomEvent.Disconnected, () => {
      this.detachCurrent();
      this.room = null;
      this.callbacks.onDisconnected();
    });

    await room.connect(url, token);
    this.room = room;
  }

  /**
   * Opens the browser's own source picker. The user chooses a screen, window
   * or tab there; this code never sees the list and cannot preselect.
   */
  async startPublishing(): Promise<void> {
    if (!this.room) throw new Error('Chưa kết nối tới phòng chia sẻ màn hình');
    await this.room.localParticipant.setScreenShareEnabled(true, { audio: false });
  }

  async stopPublishing(): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setScreenShareEnabled(false);
  }

  /**
   * Take a video track onto the panel, local or remote alike.
   *
   * Muted unconditionally: for a remote screen because system audio is out of
   * scope for the MVP, and for the publisher's own preview because playing
   * their own capture back at them would feed straight into a howl.
   */
  private adopt(track: TrackLike): void {
    if (track.kind !== 'video') return;
    this.detachCurrent();
    const element = track.attach() as HTMLVideoElement;
    element.autoplay = true;
    element.muted = true;
    element.playsInline = true;
    this.attached = element;
    this.callbacks.onTrack(element);
  }

  private detachCurrent(): void {
    if (!this.attached) return;
    this.attached.remove();
    this.attached = null;
  }

  /** Release the transport and every element it created. */
  async disconnect(): Promise<void> {
    this.detachCurrent();
    const room = this.room;
    this.room = null;
    if (room) await room.disconnect().catch(() => undefined);
  }
}
