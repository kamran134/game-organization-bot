-- ============================================================
-- Database schema — maintained in sync with TypeORM entities.
-- This file is for reference / manual DB bootstrapping only.
-- TypeORM migrations handle actual schema changes at runtime.
-- ============================================================

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  telegram_id  BIGINT NOT NULL UNIQUE,
  username     VARCHAR,
  first_name   VARCHAR,
  last_name    VARCHAR,
  phone        VARCHAR,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR NOT NULL,
  description      TEXT,
  telegram_chat_id BIGINT UNIQUE,
  creator_id       INTEGER REFERENCES users(id),
  is_private       BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code      VARCHAR UNIQUE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── group_members ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role       VARCHAR NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  joined_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, group_id)
);

-- ── sports ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sports (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  emoji      VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── locations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  map_url    VARCHAR(500),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── sport_locations ───────────────────────────────────────────
-- Many-to-many join between sports and locations
CREATE TABLE IF NOT EXISTS sport_locations (
  id          SERIAL PRIMARY KEY,
  sport_id    INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (sport_id, location_id)
);

-- ── games ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id               SERIAL PRIMARY KEY,
  group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_id       INTEGER REFERENCES users(id),
  sport_id         INTEGER NOT NULL REFERENCES sports(id),
  game_date        TIMESTAMP NOT NULL,
  location_id      INTEGER REFERENCES locations(id),
  location_text    VARCHAR,               -- @deprecated: legacy field, use location_id
  min_participants INTEGER NOT NULL DEFAULT 2,
  max_participants INTEGER NOT NULL,
  cost             DECIMAL(10, 2),
  status           VARCHAR NOT NULL DEFAULT 'planned',  -- 'planned' | 'cancelled' | 'completed'
  type             VARCHAR NOT NULL DEFAULT 'GAME',     -- 'GAME' | 'TRAINING'
  notes            TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── game_participants ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_participants (
  id                   SERIAL PRIMARY KEY,
  game_id              INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id              INTEGER REFERENCES users(id),       -- NULL for named guests
  participation_status VARCHAR NOT NULL,                   -- 'confirmed' | 'maybe' | 'guest'
  guest_name           VARCHAR,
  position             INTEGER,
  joined_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Partial unique index: one slot per (game, user) but allow unlimited anonymous guests
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_participants_game_user
  ON game_participants (game_id, user_id)
  WHERE user_id IS NOT NULL;

-- ── Performance indexes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_telegram_id            ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id        ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id       ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_games_group_id               ON games(group_id);
CREATE INDEX IF NOT EXISTS idx_games_game_date              ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_game_participants_game_id    ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_user_id    ON game_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_group_id           ON locations(group_id);
CREATE INDEX IF NOT EXISTS idx_sport_locations_location_id  ON sport_locations(location_id);
