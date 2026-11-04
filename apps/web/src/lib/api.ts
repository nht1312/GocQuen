import type {
  CafeInfo,
  GuestSession,
  JoinResult,
  ModerationReason,
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

  createGuest: (displayName?: string) =>
    request<GuestSession>('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),

  me: (token: string) =>
    request<{ userId: string; displayName: string; avatar: { presetId: string } }>(
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
