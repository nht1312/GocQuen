import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  AudioSettings,
  AvatarConfig,
  MAP_VERSION,
  SEAT_DEFINITIONS,
} from '@virtual-cafe/shared';
import { AppConfig } from '../config/app-config';
import {
  GameRecord,
  GameUpsert,
  ModerationReportRecord,
  ScreenShareSessionRecord,
  Store,
  StoredFile,
  UserRecord,
} from './store';

type QueryResult<T> = { rows: T[] };
interface PgPoolOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
}

interface PgPool {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  end(): Promise<void>;
}

const WORLD_ID = 'cafe-main';

/**
 * PostgreSQL implementation. `pg` is an optional dependency so a developer can
 * run the whole café with no infrastructure; it is only required once
 * DATABASE_URL is set.
 */
@Injectable()
export class PostgresStore extends Store {
  private readonly logger = new Logger(PostgresStore.name);
  private pool!: PgPool;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async init(): Promise<void> {
    let Pool: new (options: PgPoolOptions) => PgPool;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ({ Pool } = require('pg'));
    } catch {
      throw new Error('DATABASE_URL is set but the "pg" package is not installed. Run: npm i pg');
    }
    const ssl = this.config.databaseSsl;
    this.pool = new Pool({
      connectionString: this.config.databaseUrl as string,
      ...(ssl ? { ssl } : {}),
    });
    this.logger.log(`Connecting to Postgres (TLS ${ssl ? 'on' : 'off'})`);
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(schema);
    await this.seedWorld();
    this.logger.log('PostgreSQL store ready');
  }

  /** Seats and the world are map configuration; keep them in sync on boot. */
  private async seedWorld(): Promise<void> {
    await this.pool.query(
      `INSERT INTO worlds (id, name, map_version, is_active) VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO UPDATE SET map_version = EXCLUDED.map_version, is_active = true`,
      [WORLD_ID, 'Virtual Café', MAP_VERSION],
    );
    for (const seat of SEAT_DEFINITIONS) {
      await this.pool.query(
        `INSERT INTO seat_definitions
           (id, world_id, seat_group_id, position_x, position_y, facing, seat_type, npc_only, map_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           seat_group_id = EXCLUDED.seat_group_id,
           position_x = EXCLUDED.position_x,
           position_y = EXCLUDED.position_y,
           facing = EXCLUDED.facing,
           seat_type = EXCLUDED.seat_type,
           npc_only = EXCLUDED.npc_only,
           map_version = EXCLUDED.map_version`,
        [
          seat.seatId,
          WORLD_ID,
          seat.seatGroupId,
          seat.x,
          seat.y,
          seat.facing,
          seat.seatType,
          seat.npcOnly,
          MAP_VERSION,
        ],
      );
    }
  }

  private async readUser(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      auth_provider: string | null;
      auth_subject: string | null;
      created_at: Date;
      updated_at: Date;
      avatar_config: AvatarConfig | null;
    }>(
      `SELECT u.id, u.display_name, u.auth_provider, u.auth_subject, u.created_at, u.updated_at,
              a.avatar_config
         FROM users u
         LEFT JOIN avatars a ON a.user_id = u.id
        WHERE u.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      avatar: row.avatar_config ?? { presetId: 'clay' },
      authProvider: row.auth_provider,
      authSubject: row.auth_subject,
      createdAt: row.created_at.getTime(),
      updatedAt: row.updated_at.getTime(),
    };
  }

  async createGuestUser(displayName: string, avatar: AvatarConfig): Promise<UserRecord> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO users (id, display_name, status, auth_provider, auth_subject)
       VALUES ($1, $2, 'active', NULL, NULL)`,
      [id, displayName],
    );
    await this.pool.query(
      `INSERT INTO avatars (id, user_id, avatar_config) VALUES ($1, $2, $3)`,
      [randomUUID(), id, JSON.stringify(avatar)],
    );
    const user = await this.readUser(id);
    if (!user) throw new Error('Failed to create guest user');
    return user;
  }

  findUser(id: string): Promise<UserRecord | null> {
    return this.readUser(id);
  }

  async updateProfile(
    id: string,
    patch: { displayName?: string; avatar?: AvatarConfig },
  ): Promise<UserRecord | null> {
    if (patch.displayName !== undefined) {
      await this.pool.query(
        `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
        [id, patch.displayName],
      );
    }
    if (patch.avatar !== undefined) {
      await this.pool.query(
        `INSERT INTO avatars (id, user_id, avatar_config) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET avatar_config = EXCLUDED.avatar_config, updated_at = now()`,
        [randomUUID(), id, JSON.stringify(patch.avatar)],
      );
    }
    return this.readUser(id);
  }

  async savePreferences(userId: string, prefs: Partial<AudioSettings>): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_preferences
         (user_id, master_volume, music_volume, ambience_volume, weather_volume, crowd_volume, voice_volume, reduced_motion, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id) DO UPDATE SET
         master_volume = EXCLUDED.master_volume,
         music_volume = EXCLUDED.music_volume,
         ambience_volume = EXCLUDED.ambience_volume,
         weather_volume = EXCLUDED.weather_volume,
         crowd_volume = EXCLUDED.crowd_volume,
         voice_volume = EXCLUDED.voice_volume,
         reduced_motion = EXCLUDED.reduced_motion,
         updated_at = now()`,
      [
        userId,
        prefs.master ?? 0.7,
        prefs.music ?? 0.45,
        prefs.ambience ?? 0.55,
        prefs.weather ?? 0.4,
        prefs.crowd ?? 0.35,
        prefs.voice ?? 0.9,
        prefs.reducedMotion ?? false,
      ],
    );
  }

  async loadPreferences(userId: string): Promise<Partial<AudioSettings> | null> {
    const result = await this.pool.query<{
      master_volume: number;
      music_volume: number;
      ambience_volume: number;
      weather_volume: number;
      crowd_volume: number;
      voice_volume: number;
      reduced_motion: boolean;
    }>(`SELECT * FROM user_preferences WHERE user_id = $1`, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      master: row.master_volume,
      music: row.music_volume,
      ambience: row.ambience_volume,
      weather: row.weather_volume,
      crowd: row.crowd_volume,
      voice: row.voice_volume,
      reducedMotion: row.reduced_motion,
    };
  }

  async createReport(
    input: Omit<ModerationReportRecord, 'id' | 'createdAt' | 'status'>,
  ): Promise<ModerationReportRecord> {
    const id = randomUUID();
    const result = await this.pool.query<{ created_at: Date }>(
      `INSERT INTO moderation_reports (id, reporter_user_id, reported_user_id, reason, details)
       VALUES ($1, $2, $3, $4, $5) RETURNING created_at`,
      [id, input.reporterUserId, input.reportedUserId, input.reason, input.details],
    );
    return {
      ...input,
      id,
      status: 'open',
      createdAt: result.rows[0].created_at.getTime(),
    };
  }

  async blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [blockerUserId, blockedUserId],
    );
  }

  async unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
      [blockerUserId, blockedUserId],
    );
  }

  async listBlocks(blockerUserId: string): Promise<string[]> {
    const result = await this.pool.query<{ blocked_user_id: string }>(
      `SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = $1`,
      [blockerUserId],
    );
    return result.rows.map((row) => row.blocked_user_id);
  }

  async recordScreenShareStart(input: {
    id: string;
    instanceId: string;
    groupId: string;
    publisherId: string;
    startedAt: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO screen_share_sessions
         (id, instance_id, group_id, publisher_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'active', to_timestamp($5 / 1000.0))
       ON CONFLICT (id) DO NOTHING`,
      [input.id, input.instanceId, input.groupId, input.publisherId, input.startedAt],
    );
  }

  async recordScreenShareEnd(sessionId: string, endReason: string, endedAt: number): Promise<void> {
    // `status = 'active'` in the WHERE clause keeps the first explanation when
    // a sweep races a manual stop, matching the in-memory store.
    await this.pool.query(
      `UPDATE screen_share_sessions
          SET status = 'ended', ended_at = to_timestamp($2 / 1000.0), end_reason = $3
        WHERE id = $1 AND status = 'active'`,
      [sessionId, endedAt, endReason],
    );
  }

  async findScreenShareSession(id: string): Promise<ScreenShareSessionRecord | null> {
    const result = await this.pool.query<{
      id: string;
      instance_id: string;
      group_id: string;
      publisher_id: string;
      status: 'active' | 'ended';
      started_at: Date;
      ended_at: Date | null;
      end_reason: string | null;
    }>(
      `SELECT id, instance_id, group_id, publisher_id, status, started_at, ended_at, end_reason
         FROM screen_share_sessions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      instanceId: row.instance_id,
      groupId: row.group_id,
      publisherId: row.publisher_id,
      status: row.status,
      startedAt: row.started_at.getTime(),
      endedAt: row.ended_at ? row.ended_at.getTime() : null,
      endReason: row.end_reason,
    };
  }

  async listGames(): Promise<GameRecord[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      hint: string;
      sort_order: number;
      updated_at: Date;
    }>(`SELECT id, title, hint, sort_order, updated_at FROM games ORDER BY sort_order, title`);
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      hint: row.hint,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at.getTime(),
    }));
  }

  async getGameBanner(id: string): Promise<StoredFile | null> {
    const result = await this.pool.query<{ banner: Buffer; banner_type: string; updated_at: Date }>(
      `SELECT banner, banner_type, updated_at FROM games WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? { data: row.banner, contentType: row.banner_type, updatedAt: row.updated_at.getTime() } : null;
  }

  async getGameRom(id: string): Promise<StoredFile | null> {
    const result = await this.pool.query<{ rom: Buffer; updated_at: Date }>(
      `SELECT rom, updated_at FROM games WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? { data: row.rom, contentType: 'application/octet-stream', updatedAt: row.updated_at.getTime() } : null;
  }

  async upsertGame(game: GameUpsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO games (id, title, hint, sort_order, banner, banner_type, rom, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         hint = EXCLUDED.hint,
         sort_order = EXCLUDED.sort_order,
         banner = EXCLUDED.banner,
         banner_type = EXCLUDED.banner_type,
         rom = EXCLUDED.rom,
         updated_at = now()`,
      [game.id, game.title, game.hint, game.sortOrder, game.banner.data, game.banner.contentType, game.rom],
    );
  }
}
