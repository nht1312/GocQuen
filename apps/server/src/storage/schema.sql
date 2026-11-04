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
