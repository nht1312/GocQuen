import { AudioSettings, AvatarConfig, ModerationReason } from '@virtual-cafe/shared';

/**
 * Durable data only (SPEC 12.2): avatar positions, seat occupancy and voice
 * membership deliberately never reach this layer — they live in the realtime
 * server's memory and expire with the session.
 */

export interface UserRecord {
  id: string;
  displayName: string;
  avatar: AvatarConfig;
  authProvider: string | null;
  authSubject: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModerationReportRecord {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: ModerationReason;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: number;
}

export abstract class Store {
  abstract init(): Promise<void>;
  abstract createGuestUser(displayName: string, avatar: AvatarConfig): Promise<UserRecord>;
  abstract findUser(id: string): Promise<UserRecord | null>;
  abstract updateProfile(
    id: string,
    patch: { displayName?: string; avatar?: AvatarConfig },
  ): Promise<UserRecord | null>;
  abstract savePreferences(userId: string, prefs: Partial<AudioSettings>): Promise<void>;
  abstract loadPreferences(userId: string): Promise<Partial<AudioSettings> | null>;
  abstract createReport(
    input: Omit<ModerationReportRecord, 'id' | 'createdAt' | 'status'>,
  ): Promise<ModerationReportRecord>;
  abstract blockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  abstract unblockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  abstract listBlocks(blockerUserId: string): Promise<string[]>;
}
