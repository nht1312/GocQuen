import type { ScreenShareSessionInfo } from '@virtual-cafe/shared';

/**
 * What the local client is doing, as distinct from what the server believes.
 *
 * The server knows who holds a table's slot; it does not know that this
 * browser has a source picker open, or that its transport just dropped. Those
 * two sources of truth are kept apart and combined in one place below.
 */
export type LocalScreenShareState =
  | 'none'
  | 'selecting'
  | 'connecting'
  | 'denied'
  | 'reconnecting'
  | 'error';

/** The ten states the feature spec asks the UI to express. */
export type ScreenSharePhase =
  | 'idle'
  | 'selecting'
  | 'connecting'
  | 'publishing'
  | 'watching'
  | 'denied'
  | 'reconnecting'
  | 'error';

export interface ScreenShareView {
  phase: ScreenSharePhase;
  /** Only ever set when the viewer is entitled to see it. */
  session: ScreenShareSessionInfo | null;
  isPublisher: boolean;
  canStart: boolean;
  /** Why the current state is what it is, in the café's own voice. */
  message: string | null;
}

export interface ScreenShareInput {
  /** The session the server says exists at this table, or null. */
  session: ScreenShareSessionInfo | null;
  selfId: string | null;
  seated: boolean;
  local: LocalScreenShareState;
}

/**
 * Collapse server session state and local transport state into one view.
 *
 * Pure on purpose. Every rule about what a person may see or do is decided
 * here rather than scattered through components, which is what makes the ten
 * required states testable without a browser or an SFU.
 *
 * Order matters: being unseated outranks everything, because leaving a table
 * revokes access immediately and the panel must go even if the server's last
 * word still named a session. Local transport trouble outranks the session
 * too — claiming to be "watching" while the connection is down would describe
 * a frozen frame as live.
 */
export function deriveScreenShareView(input: ScreenShareInput): ScreenShareView {
  const { session, selfId, seated, local } = input;

  if (!seated) {
    return {
      phase: 'idle',
      session: null,
      isPublisher: false,
      canStart: false,
      message: 'Hãy ngồi vào bàn để chia sẻ hoặc xem màn hình',
    };
  }

  if (local === 'denied') {
    return {
      phase: 'denied',
      session,
      isPublisher: false,
      // Refusing once is not a decision to never share again.
      canStart: true,
      message: 'Bạn đã từ chối quyền chia sẻ màn hình. Hãy thử lại và chọn một màn hình.',
    };
  }

  if (local === 'reconnecting') {
    return {
      phase: 'reconnecting',
      session,
      isPublisher: session?.publisherId === selfId,
      canStart: false,
      message: 'Đang kết nối lại…',
    };
  }

  if (local === 'error') {
    return {
      phase: 'error',
      session,
      isPublisher: false,
      canStart: true,
      message: 'Mất kết nối tới màn hình được chia sẻ.',
    };
  }

  if (session) {
    const mine = session.publisherId === selfId;
    return {
      phase: mine ? 'publishing' : 'watching',
      session,
      isPublisher: mine,
      canStart: false,
      message: mine ? null : `${session.publisherName} đang chia sẻ màn hình ở bàn này`,
    };
  }

  if (local === 'selecting') {
    return {
      phase: 'selecting',
      session: null,
      isPublisher: false,
      canStart: false,
      message: 'Hãy chọn màn hình hoặc cửa sổ bạn muốn chia sẻ…',
    };
  }

  if (local === 'connecting') {
    return {
      phase: 'connecting',
      session: null,
      isPublisher: false,
      canStart: false,
      message: 'Đang bắt đầu chia sẻ…',
    };
  }

  return { phase: 'idle', session: null, isPublisher: false, canStart: true, message: null };
}
