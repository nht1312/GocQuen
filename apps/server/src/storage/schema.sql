-- Virtual Café — durable schema (SPEC 12.1).
-- Realtime data (positions, seat occupancy, voice membership) is intentionally
-- absent: it lives in the realtime server and expires with the session.

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  display_name   TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'active',
  auth_provider  TEXT,
  auth_subject   TEXT,
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE IF NOT EXISTS avatars (
  id            UUID PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  avatar_config JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id          UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  master_volume    REAL        NOT NULL DEFAULT 0.7,
  music_volume     REAL        NOT NULL DEFAULT 0.45,
  ambience_volume  REAL        NOT NULL DEFAULT 0.55,
  weather_volume   REAL        NOT NULL DEFAULT 0.4,
  crowd_volume     REAL        NOT NULL DEFAULT 0.35,
  voice_volume     REAL        NOT NULL DEFAULT 0.9,
  reduced_motion   BOOLEAN     NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worlds (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  map_version INTEGER NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS world_instances (
  id         UUID PRIMARY KEY,
  world_id   TEXT        NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  region     TEXT        NOT NULL DEFAULT 'default',
  capacity   INTEGER     NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seats are map configuration, not per-sitting records (SPEC 12.1).
CREATE TABLE IF NOT EXISTS seat_definitions (
  id            TEXT PRIMARY KEY,
  world_id      TEXT    NOT NULL REFERENCES worlds (id) ON DELETE CASCADE,
  seat_group_id TEXT    NOT NULL,
  position_x    REAL    NOT NULL,
  position_y    REAL    NOT NULL,
  facing        TEXT    NOT NULL,
  seat_type     TEXT    NOT NULL,
  npc_only      BOOLEAN NOT NULL DEFAULT false,
  map_version   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id               UUID PRIMARY KEY,
  reporter_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reported_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason           TEXT        NOT NULL,
  details          TEXT,
  status           TEXT        NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_reports_status_idx
  ON moderation_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

-- Audit trail for admin actions (SPEC 14.3).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id         UUID PRIMARY KEY,
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  target     TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen-sharing audit trail (feature spec section 8). Metadata only: this
-- records that a share happened, between whom and for how long. No column
-- could hold screen content, and none ever should.
--
-- Note this is NOT what enforces one publisher per table. The café runs as a
-- single instance and the live registry in ScreenShareService decides that
-- synchronously; these rows are written afterwards and are an audit log, not
-- a lock. The partial unique index below is a backstop that would catch a
-- second writer if that ever stopped being true.
CREATE TABLE IF NOT EXISTS screen_share_sessions (
  id           UUID PRIMARY KEY,
  instance_id  UUID        NOT NULL,
  group_id     TEXT        NOT NULL,
  publisher_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'active',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  end_reason   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS screen_share_sessions_one_active_per_table_idx
  ON screen_share_sessions (instance_id, group_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS screen_share_sessions_publisher_idx
  ON screen_share_sessions (publisher_id, started_at DESC);

CREATE INDEX IF NOT EXISTS screen_share_sessions_instance_idx
  ON screen_share_sessions (instance_id, status);

-- Khu Chơi Game library. The banner image and the .nes file are stored in
-- the row itself (both are small: banners < 1 MB, NES ROMs < 2 MB).
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  title       TEXT        NOT NULL,
  hint        TEXT        NOT NULL DEFAULT '',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  banner      BYTEA       NOT NULL,
  banner_type TEXT        NOT NULL,
  rom         BYTEA       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content hashes (sha256 hex) let the boot sync skip unchanged files and give
-- every file an immutable, cacheable URL. Credit is shown under each game.
ALTER TABLE games ADD COLUMN IF NOT EXISTS credit        TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS rom_sha256    TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS banner_sha256 TEXT NOT NULL DEFAULT '';
