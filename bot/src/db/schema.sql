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
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quejas_state         ON quejas(state);
CREATE INDEX IF NOT EXISTS idx_quejas_neighborhood  ON quejas(neighborhood);
CREATE INDEX IF NOT EXISTS idx_quejas_user          ON quejas(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_quejas_concejal      ON quejas(concejal_slug);

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
