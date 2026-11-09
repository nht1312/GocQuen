import type {
  AvatarConfig,
  CafeInfo,
  GameSummary,
  GuestSession,
  JoinResult,
  ModerationReason,
  ScreenShareState,
  VoiceTokenResult,
} from '@virtual-cafe/shared';

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Không kết nối được tới quán. Hãy kiểm tra kết nối mạng của bạn.', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Yêu cầu thất bại (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  cafeInfo: () => request<CafeInfo>('/cafe'),

  /** Khu Chơi Game library, read from the database. */
  games: () => request<{ games: GameSummary[] }>('/games'),

  /** A game's .nes file, as raw bytes (guest session required). */
  gameRom: async (token: string, romUrl: string): Promise<ArrayBuffer> => {
    let response: Response;
    try {
      response = await fetch(`${SERVER_URL}${romUrl}`, { headers: { authorization: `Bearer ${token}` } });
    } catch {
      throw new ApiError('Không kết nối được tới quán. Hãy kiểm tra kết nối mạng của bạn.', 0);
    }
    if (!response.ok) throw new ApiError(`Không tải được game (${response.status})`, response.status);
    return response.arrayBuffer();
  },

  createGuest: (displayName?: string) =>
    request<GuestSession>('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),

  me: (token: string) =>
    request<{ userId: string; displayName: string; avatar: AvatarConfig }>(
      '/me',
      {},
      token,
    ),

  updateProfile: (token: string, patch: { displayName?: string; avatarPresetId?: string }) =>
    request<GuestSession>('/me/profile', { method: 'PATCH', body: JSON.stringify(patch) }, token),

  joinCafe: (token: string) => request<JoinResult>('/cafe/join', { method: 'POST' }, token),

  leaveCafe: (token: string) => request<{ left: boolean }>('/cafe/leave', { method: 'POST' }, token),

  voiceToken: (token: string) =>
    request<VoiceTokenResult>('/voice/token', { method: 'POST' }, token),

  /**
   * Screen sharing. The table is never sent — the server reads it from the
   * seat it says you occupy, so there is no id here to tamper with.
   */
  screenShareState: (token: string) =>
    request<ScreenShareState>('/voice/screen-share', {}, token),

  screenShareToken: (token: string) =>
    request<VoiceTokenResult>('/voice/screen-share/token', { method: 'POST' }, token),

  screenShareStart: (token: string) =>
    request<ScreenShareState>('/voice/screen-share/start', { method: 'POST' }, token),

  screenShareStop: (token: string) =>
    request<ScreenShareState>('/voice/screen-share/stop', { method: 'POST' }, token),

  report: (
    token: string,
    payload: { reportedUserId: string; reason: ModerationReason; details?: string },
  ) =>
    request<{ id: string }>(
      '/moderation/reports',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    ),

  block: (token: string, userId: string) =>
    request<{ blocked: boolean }>(`/users/${userId}/block`, { method: 'POST' }, token),

  blocks: (token: string) => request<{ blocked: string[] }>('/me/blocks', {}, token),

  unblock: (token: string, userId: string) =>
    request<{ blocked: boolean }>(`/users/${userId}/block`, { method: 'DELETE' }, token),
};
