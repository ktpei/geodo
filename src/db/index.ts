import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  Session,
  ExtractionQueueItem,
  AppConfig,
} from '@/types';

// ── Schema ──

interface GeodoDBSchema extends DBSchema {
  knowledge_entries: {
    key: string;
    value: KnowledgeEntry;
    indexes: {
      'by-category': KnowledgeCategory;
      'by-domain': string;
      'by-timestamp': string;
      'by-platform': string;
    };
  };
  sessions: {
    key: string;
    value: Session;
    indexes: {
      'by-start': string;
    };
  };
  extraction_queue: {
    key: string;
    value: ExtractionQueueItem;
    indexes: {
      'by-timestamp': string;
    };
  };
  config: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'geodo-knowledge';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<GeodoDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<GeodoDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<GeodoDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Knowledge entries store
      if (!db.objectStoreNames.contains('knowledge_entries')) {
        const store = db.createObjectStore('knowledge_entries', { keyPath: 'id' });
        store.createIndex('by-category', 'category');
        store.createIndex('by-domain', 'source.domain');
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-platform', 'source.platform');
      }

      // Sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' });
        store.createIndex('by-start', 'start');
      }

      // Extraction queue store
      if (!db.objectStoreNames.contains('extraction_queue')) {
        const store = db.createObjectStore('extraction_queue', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      }

      // Config store
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    },
  });

  return dbInstance;
}

// ── Knowledge Entries ──

export async function addKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
  const db = await getDB();
  await db.put('knowledge_entries', entry);
}

export async function getKnowledgeEntry(id: string): Promise<KnowledgeEntry | undefined> {
  const db = await getDB();
  return db.get('knowledge_entries', id);
}

export async function getEntriesByCategory(category: KnowledgeCategory): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('knowledge_entries', 'by-category', category);
}

export async function getEntriesByDomain(domain: string): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('knowledge_entries', 'by-domain', domain);
}

export async function getEntriesByPlatform(platform: string): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('knowledge_entries', 'by-platform', platform);
}

export async function getEntriesByTimeRange(start: string, end: string): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex(
    'knowledge_entries',
    'by-timestamp',
    IDBKeyRange.bound(start, end),
  );
}

export async function getAllEntries(): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  return db.getAll('knowledge_entries');
}

export async function getEntriesWithEmbeddings(): Promise<KnowledgeEntry[]> {
  const db = await getDB();
  const all = await db.getAll('knowledge_entries');
  return all.filter((e) => e.embedding && e.embedding.length > 0);
}

export async function updateEntryEmbedding(id: string, embedding: number[]): Promise<void> {
  const db = await getDB();
  const entry = await db.get('knowledge_entries', id);
  if (entry) {
    entry.embedding = embedding;
    await db.put('knowledge_entries', entry);
  }
}

export async function countEntries(): Promise<number> {
  const db = await getDB();
  return db.count('knowledge_entries');
}

export async function countEntriesByCategory(): Promise<Record<KnowledgeCategory, number>> {
  const categories: KnowledgeCategory[] = ['communication', 'research', 'workflow', 'domain', 'search'];
  const db = await getDB();
  const counts = {} as Record<KnowledgeCategory, number>;
  for (const cat of categories) {
    counts[cat] = await db.countFromIndex('knowledge_entries', 'by-category', cat);
  }
  return counts;
}

// ── Sessions ──

export async function addSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function updateSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function pruneOldSessions(olderThanDays: number = 30): Promise<void> {
  const db = await getDB();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const tx = db.transaction('sessions', 'readwrite');
  const index = tx.store.index('by-start');
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── Extraction Queue ──

export async function addToQueue(item: ExtractionQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('extraction_queue', item);
}

export async function getQueueItems(limit: number = 10): Promise<ExtractionQueueItem[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('extraction_queue', 'by-timestamp');
  return all.slice(0, limit);
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('extraction_queue', id);
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('extraction_queue');
}

// ── Config ──

const DEFAULT_CONFIG: AppConfig = {
  enabled: true,
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
