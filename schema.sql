-- ============================================================
-- FrelerrBOT — Schema Supabase
-- Incolla tutto questo nel SQL Editor di Supabase e premi Run
-- ============================================================

CREATE TABLE IF NOT EXISTS levels (
  user_id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  first_joined BIGINT
);

CREATE TABLE IF NOT EXISTS warns (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  issued_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ban_info (
  user_id TEXT PRIMARY KEY,
  reason TEXT,
  banned_by TEXT,
  banned_at BIGINT
);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id TEXT PRIMARY KEY,
  creator_id TEXT,
  category TEXT,
  form_data JSONB DEFAULT '{}',
  staff_id TEXT,
  taken BOOLEAN NOT NULL DEFAULT FALSE,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  last_message BIGINT,
  warning_sent BOOLEAN NOT NULL DEFAULT FALSE,
  guild_id TEXT
);

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  channel_id TEXT PRIMARY KEY,
  lines JSONB NOT NULL DEFAULT '[]',
  category TEXT,
  creator_id TEXT,
  closed_at BIGINT
);

CREATE TABLE IF NOT EXISTS giveaways (
  message_id TEXT PRIMARY KEY,
  prize TEXT,
  max_winners INTEGER NOT NULL DEFAULT 1,
  ends_at BIGINT,
  channel_id TEXT,
  guild_id TEXT,
  host_id TEXT,
  participants JSONB NOT NULL DEFAULT '[]',
  ended BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT,
  max_players INTEGER NOT NULL DEFAULT 0,
  guild_id TEXT
);

CREATE TABLE IF NOT EXISTS welcomed (
  user_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS unban_requests (
  user_id TEXT PRIMARY KEY,
  message_id TEXT,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  guild_id TEXT,
  ticket_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS leaderboard_messages (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT INTO settings (key, value) VALUES ('infolvl_last_sent', '0') ON CONFLICT DO NOTHING;

-- ── Funzioni per incremento atomico XP ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_messages(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO levels (user_id, messages) VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE SET messages = levels.messages + 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_voice_minutes(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO levels (user_id, voice_minutes) VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE SET voice_minutes = levels.voice_minutes + 1;
END;
$$ LANGUAGE plpgsql;
