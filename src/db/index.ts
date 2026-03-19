import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { GeodoEvent, AppConfig } from '@/types';

// ── Schema ──

interface GeodoEventsDB extends DBSchema {
  events: {
    key: string;
    value: GeodoEvent;
    indexes: {
      'by-event-name': string;
      'by-session-id': string;
      'by-timestamp': string;
    };
  };
  config: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'geodo-events';
const DB_VERSION = 1;
const MAX_EVENTS = 500;

let dbInstance: IDBPDatabase<GeodoEventsDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<GeodoEventsDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<GeodoEventsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('events')) {
        const store = db.createObjectStore('events', { keyPath: 'event_id' });
        store.createIndex('by-event-name', 'event_name');
        store.createIndex('by-session-id', 'session_id');
        store.createIndex('by-timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    },
  });

  return dbInstance;
}

// ── Events ──

export async function addEvent(event: GeodoEvent): Promise<void> {
  const db = await getDB();
  // Enforce cap
  const count = await db.count('events');
  if (count >= MAX_EVENTS) {
    // Remove oldest event to make room
    const oldest = await db.getAllFromIndex('events', 'by-timestamp');
    if (oldest.length > 0) {
      await db.delete('events', oldest[0].event_id);
    }
  }
  await db.put('events', event);
}

export async function getAllEvents(): Promise<GeodoEvent[]> {
  const db = await getDB();
  return db.getAllFromIndex('events', 'by-timestamp');
}

export async function countEvents(): Promise<number> {
  const db = await getDB();
  return db.count('events');
}

// ── Config ──

const DEFAULT_CONFIG: AppConfig = {
  enabled: true,
  api_url: 'http://localhost:3000',
  api_key: 'geodo_dev_2026',
};

export async function getConfig(): Promise<AppConfig> {
  const db = await getDB();
  const stored = await db.get('config', 'app');
  return (stored as AppConfig) ?? DEFAULT_CONFIG;
}

export async function setConfig(config: Partial<AppConfig>): Promise<void> {
  const db = await getDB();
  const current = await getConfig();
  await db.put('config', { ...current, ...config }, 'app');
}
