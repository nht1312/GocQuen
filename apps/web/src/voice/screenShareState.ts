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

/**
 * Whether this client should currently hold a connection to the table's
 * screen room.
 *
 * Derived from the view rather than tracked separately, so the transport can
 * never disagree with what the UI is showing. In particular `idle` is false:
 * standing up or the publisher stopping must drop the subscription rather
 * than leave it feeding a screen we may no longer be entitled to see.
 *
 * `reconnecting` is true because the point of reconnecting is to recover the
 * same connection, not to tear it down.
 */
export function needsScreenRoom(view: ScreenShareView): boolean {
  return (
    view.phase === 'publishing' ||
    view.phase === 'watching' ||
    view.phase === 'connecting' ||
    view.phase === 'reconnecting'
  );
}

/**
 * Whether this browser can capture a screen at all (spec §10).
 *
 * Checked before opening the picker so an unsupported browser gets a plain
 * explanation rather than an exception from deep inside the SDK. Takes the
 * media devices object rather than reading `navigator` directly, so the rule
 * is testable and so it is safe during server rendering, where there is no
 * navigator to read.
 */
export function isScreenShareSupported(
  mediaDevices: { getDisplayMedia?: unknown } | null | undefined,
): boolean {
  return typeof mediaDevices?.getDisplayMedia === 'function';
}

export interface ScreenShareFailure {
  local: LocalScreenShareState;
  message: string;
  /** Whether this is worth interrupting someone with. */
  toast: boolean;
}

/**
 * Turn whatever went wrong into something the café can say (spec §10).
 *
 * The distinction that matters is whether the person did something
 * deliberate. Closing the source picker is not an error and must not raise a
 * toast; losing the transport is, because retrying may well work.
 *
 * Note that Chrome raises `NotAllowedError` both when permission is refused
 * and when the picker is simply closed, so the two cannot be told apart. The
 * wording therefore covers both without accusing anyone of refusing.
 */
export function classifyScreenShareError(error: unknown): ScreenShareFailure {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return {
        local: 'denied',
        message: 'Chưa chia sẻ được màn hình. Hãy thử lại và chọn một màn hình để chia sẻ.',
        toast: false,
      };
    }
    if (error.name === 'AbortError' || error.name === 'NotFoundError') {
      // Nothing was chosen. Saying anything at all would be noise.
      return { local: 'none', message: '', toast: false };
    }
  }

  return {
    local: 'error',
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Không kết nối được tới phòng chia sẻ màn hình. Hãy thử lại.',
    toast: true,
  };
}

/**
 * Which hop of starting a share failed, in the café's own words.
 *
 * Shown in the toast so a person can say which step broke rather than only
 * that "it did not work" — the three hops fail for completely different
 * reasons and need different fixes.
 */
export const SCREEN_STEP_LABEL: Record<'claim' | 'token' | 'connect' | 'publish', string> = {
  claim: 'Không đăng ký được lượt chia sẻ',
  token: 'Không lấy được quyền chia sẻ màn hình',
  connect: 'Không kết nối được tới máy chủ hình ảnh',
  publish: 'Không gửi được màn hình đi',
};
