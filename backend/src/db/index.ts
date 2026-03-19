// Uses Node.js built-in sqlite (Node 22.5+ / stable in Node 24)
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../geodo.db');

let db: DatabaseSync | null = null;

export function getDB(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(DB_PATH);
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      event_id   TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      timestamp  TEXT NOT NULL,
      platform   TEXT,
      page_type  TEXT,
      url        TEXT,
      payload    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_event_name ON events(event_name);
    CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp  ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_user_id    ON events(user_id);
  `);
}

export interface StoredEvent {
  event_id: string;
  user_id: string;
  session_id: string;
  event_name: string;
  timestamp: string;
  platform: string | null;
  page_type: string | null;
  url: string | null;
  payload: string; // JSON string
  created_at: string;
}

export function insertEvent(event: {
  event_id: string;
  user_id: string;
  session_id: string;
  event_name: string;
  timestamp: string;
  platform?: string;
  page_type?: string;
  url?: string;
  payload: Record<string, unknown>;
}): boolean {
  const database = getDB();
  const existing = database.prepare('SELECT event_id FROM events WHERE event_id = ?').get(event.event_id);
  if (existing) return false;

  database.prepare(`
    INSERT INTO events (event_id, user_id, session_id, event_name, timestamp, platform, page_type, url, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.event_id,
    event.user_id,
    event.session_id,
    event.event_name,
    event.timestamp,
    event.platform ?? null,
    event.page_type ?? null,
    event.url ?? null,
    JSON.stringify(event.payload),
  );
  return true;
}

export function queryEvents(opts: {
  event_name?: string;
  session_id?: string;
  limit?: number;
}): StoredEvent[] {
  const database = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.event_name) { conditions.push('event_name = ?'); params.push(opts.event_name); }
  if (opts.session_id) { conditions.push('session_id = ?'); params.push(opts.session_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = `LIMIT ${opts.limit ?? 100}`;

  return database.prepare(
    `SELECT * FROM events ${where} ORDER BY timestamp DESC ${limitClause}`
  ).all(...params) as StoredEvent[];
}

export function getAllEvents(): StoredEvent[] {
  return getDB().prepare('SELECT * FROM events ORDER BY timestamp ASC').all() as StoredEvent[];
}

export function countEvents(): number {
  return (getDB().prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
}
