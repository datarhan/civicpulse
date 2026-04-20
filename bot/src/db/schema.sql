-- CivicPulse bot — SQLite schema.
-- WAL + foreign keys set in client.ts via PRAGMA.

CREATE TABLE IF NOT EXISTS quejas (
  id                      TEXT PRIMARY KEY,
  telegram_user_id        INTEGER NOT NULL,
  telegram_username       TEXT,
  category                TEXT NOT NULL,
  title                   TEXT NOT NULL,
  detail                  TEXT NOT NULL,
  lat                     REAL,
  lng                     REAL,
  neighborhood            TEXT,
  photo_file_id           TEXT,
  concejalia_area         TEXT,
  concejal_slug           TEXT,
  state                   TEXT NOT NULL DEFAULT 'capturada',
  registro_entry_number   TEXT,
  registro_csv            TEXT,
  registered_at           TEXT,
  resolved_at             TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  -- LOPD/GDPR: soft-delete. When a citizen invokes /olvidar, the row stays
  -- in the audit trail but every exporter + renderer filters out rows where
  -- deleted_at IS NOT NULL. Physical deletion is out of scope — we need the
  -- audit trail for the 5-year retention window (Art. 55 LOPD-GDD) while
  -- still honouring the individual's right to be forgotten on public surfaces.
  deleted_at              TEXT
);

CREATE INDEX IF NOT EXISTS idx_quejas_state         ON quejas(state);
CREATE INDEX IF NOT EXISTS idx_quejas_neighborhood  ON quejas(neighborhood);
CREATE INDEX IF NOT EXISTS idx_quejas_user          ON quejas(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_quejas_concejal      ON quejas(concejal_slug);
CREATE INDEX IF NOT EXISTS idx_quejas_deleted       ON quejas(deleted_at);

CREATE TABLE IF NOT EXISTS apoyos (
  queja_id          TEXT NOT NULL,
  telegram_user_id  INTEGER NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (queja_id, telegram_user_id),
  FOREIGN KEY (queja_id) REFERENCES quejas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_apoyos_queja ON apoyos(queja_id);

-- Audit trail: every state transition + apoyo milestone is an event.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  queja_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (queja_id) REFERENCES quejas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_queja ON events(queja_id);

-- Weekly-digest subscriptions. A user can subscribe multiple filters.
-- filter_kind ∈ { barrio, concejalia, categoria }. filter_value is
-- free-form (we match case-insensitively against the current snapshot
-- field — e.g. 'barrio' matches queja.address_string / neighborhood
-- slug). Every Monday at 09:00 the digest cron emits a DM per user
-- with matching deltas from the past 7 days.
CREATE TABLE IF NOT EXISTS subscriptions (
  telegram_user_id  INTEGER NOT NULL,
  filter_kind       TEXT NOT NULL,
  filter_value      TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_user_id, filter_kind, filter_value)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(telegram_user_id);
