import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AudioSettings, AvatarConfig } from '@virtual-cafe/shared';
import { ModerationReportRecord, Store, UserRecord } from './store';

/** Default store for development and prototypes. Everything is lost on restart. */
@Injectable()
export class MemoryStore extends Store {
  private readonly users = new Map<string, UserRecord>();
  private readonly preferences = new Map<string, Partial<AudioSettings>>();
  private readonly reports = new Map<string, ModerationReportRecord>();
  private readonly blocks = new Map<string, Set<string>>();

  async init(): Promise<void> {
    /* nothing to migrate */
  }

  async createGuestUser(displayName: string, avatar: AvatarConfig): Promise<UserRecord> {
    const now = Date.now();
    const user: UserRecord = {
      id: randomUUID(),
      displayName,
      avatar,
      authProvider: null,
      authSubject: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUser(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async updateProfile(
    id: string,
    patch: { displayName?: string; avatar?: AvatarConfig },
  ): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const next: UserRecord = {
      ...user,
      displayName: patch.displayName ?? user.displayName,
      avatar: patch.avatar ?? user.avatar,
      updatedAt: Date.now(),
    };
    this.users.set(id, next);
    return next;
  }

  async savePreferences(userId: string, prefs: Partial<AudioSettings>): Promise<void> {
    this.preferences.set(userId, { ...this.preferences.get(userId), ...prefs });
  }

  async loadPreferences(userId: string): Promise<Partial<AudioSettings> | null> {
    return this.preferences.get(userId) ?? null;
  }

  async createReport(
    input: Omit<ModerationReportRecord, 'id' | 'createdAt' | 'status'>,
  ): Promise<ModerationReportRecord> {
    const report: ModerationReportRecord = {
      ...input,
      id: randomUUID(),
      status: 'open',
      createdAt: Date.now(),
    };
    this.reports.set(report.id, report);
    return report;
  }

  async blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    const set = this.blocks.get(blockerUserId) ?? new Set<string>();
    set.add(blockedUserId);
    this.blocks.set(blockerUserId, set);
  }

  async unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    this.blocks.get(blockerUserId)?.delete(blockedUserId);
  }

  async listBlocks(blockerUserId: string): Promise<string[]> {
    return [...(this.blocks.get(blockerUserId) ?? [])];
  }
}
