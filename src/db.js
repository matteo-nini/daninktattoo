import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Date in UTC, formato SQLite 'YYYY-MM-DD HH:MM:SS'. Importi sempre in centesimi.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                       -- 'giftcard' (in futuro anche 'shop')
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid
  email TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',          -- JSON con i dettagli propri del tipo di ordine
  stripe_session TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS giftcards (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  order_id INTEGER UNIQUE REFERENCES orders(id),   -- NULL se creata a mano in studio
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
  format TEXT NOT NULL CHECK (format IN ('digital', 'physical')),
  buyer_name TEXT,
  buyer_email TEXT,
  recipient_name TEXT,
  message TEXT,
  shipping TEXT,
  note TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  emailed_at TEXT,
  shipped_at TEXT
);
CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY,
  giftcard_id INTEGER NOT NULL REFERENCES giftcards(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  topic TEXT NOT NULL,
  placement TEXT,
  budget TEXT,
  body TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  emailed_at TEXT
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
