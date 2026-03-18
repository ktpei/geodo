import { v4 as uuidv4 } from 'uuid';
import {
  addKnowledgeEntry,
  addSession,
  updateSession,
  getSession,
  addToQueue,
  getQueueItems,
  removeFromQueue,
  getConfig,
  setConfig,
  countEntries,
  countEntriesByCategory,
  pruneOldSessions,
  updateEntryEmbedding,
} from '@/db';
import { searchByEmbedding, composeEmbeddingText } from '@/db/vector-search';
import type {
  KnowledgeEntry,
  ExtractedContent,
  MessageType,
  AppConfig,
} from '@/types';

// ── Session Management ──

let currentSessionId: string | null = null;

async function startSession(): Promise<string> {
  const id = uuidv4();
  currentSessionId = id;
  await addSession({
    id,
    start: new Date().toISOString(),
  });
  return id;
}

async function endSession(): Promise<void> {
  if (!currentSessionId) return;
  const session = await getSession(currentSessionId);
  if (session) {
    const end = new Date().toISOString();
    const duration_ms = new Date(end).getTime() - new Date(session.start).getTime();
    await updateSession({ ...session, end, duration_ms });
  }
  currentSessionId = null;
}

async function ensureSession(): Promise<string> {
  if (!currentSessionId) {
    return startSession();
  }
  return currentSessionId;
}

// ── Content Processing ──

async function processExtractedContent(payload: ExtractedContent): Promise<void> {
  console.log(`[Geodo] Processing extracted content:`, payload.category, payload.source.platform, payload.source.url);
  const config = await getConfig();
  if (!config.enabled) {
    console.log('[Geodo] Extension disabled, skipping');
    return;
  }

  const sessionId = await ensureSession();

  const entry: KnowledgeEntry = {
    id: uuidv4(),
    category: payload.category,
    source: payload.source,
    timestamp: new Date().toISOString(),
    content: payload.content,
    context: {
      session_id: sessionId,
      time_spent_ms: payload.time_spent_ms,
    },
  };

  await addKnowledgeEntry(entry);
  console.log(`[Geodo] Stored knowledge entry: ${entry.id} (${entry.category})`);

  // Request embedding generation from offscreen document
  requestEmbedding(entry);
}

async function requestEmbedding(entry: KnowledgeEntry): Promise<void> {
  const text = composeEmbeddingText(entry);
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      target: 'offscreen',
      payload: { id: entry.id, text },
    });
    if (response?.embedding) {
      await updateEntryEmbedding(entry.id, response.embedding);
    }
  } catch {
    // Offscreen document may not be ready yet — embedding will be retried
  }
}

// ── Offscreen Document Management ──

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) return;

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run ONNX embedding model and LLM API calls',
  });

  await offscreenCreating;
  offscreenCreating = null;
}

// ── LLM Queue Processing ──

async function processExtractionQueue(): Promise<void> {
  const config = await getConfig();
  if (!config.llm_api_key) return;

  const items = await getQueueItems(5);
  if (items.length === 0) return;

  await ensureOffscreenDocument();

  for (const item of items) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LLM_EXTRACT',
        target: 'offscreen',
        payload: {
          url: item.url,
          title: item.title,
          raw_text: item.raw_text,
          api_key: config.llm_api_key,
          provider: config.llm_provider ?? 'openai',
        },
      });

      if (response?.entry) {
        const entry: KnowledgeEntry = {
          ...response.entry,
          id: uuidv4(),
          timestamp: item.timestamp,
          context: {
            session_id: item.session_id,
          },
        };
        await addKnowledgeEntry(entry);
        requestEmbedding(entry);
      }

      await removeFromQueue(item.id);
    } catch {
      // Will retry on next alarm cycle
    }
  }
}

// ── Message Handler ──

chrome.runtime.onMessage.addListener((message: MessageType & { target?: string }, _sender, sendResponse) => {
  // Ignore messages targeted at offscreen document
  if ('target' in message && message.target === 'offscreen') return false;

  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'CONTENT_EXTRACTED':
      await processExtractedContent(message.payload);
      return { success: true };

    case 'QUEUE_FOR_LLM': {
      const sessionId = await ensureSession();
      await addToQueue({
        id: uuidv4(),
        url: message.payload.url,
        title: message.payload.title,
        raw_text: message.payload.raw_text,
        timestamp: new Date().toISOString(),
        session_id: sessionId,
      });
      return { success: true };
    }

    case 'QUERY_KNOWLEDGE': {
      const { query, category, limit } = message.payload;
      // Generate embedding for the query
      await ensureOffscreenDocument();
      const embResponse = await chrome.runtime.sendMessage({
        type: 'GENERATE_EMBEDDING',
        target: 'offscreen',
        payload: { id: 'query', text: query },
      });
      if (!embResponse?.embedding) {
        return { results: [], error: 'Embedding generation failed' };
      }
      const results = await searchByEmbedding(embResponse.embedding, { limit, category });
      return { results };
    }

    case 'GET_CONFIG':
      return getConfig();

    case 'SET_CONFIG':
      await setConfig(message.payload);
      return { success: true };

    case 'GET_STATS': {
      const total = await countEntries();
      const byCategory = await countEntriesByCategory();
      return { total, byCategory };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── External Message Handler (other extensions / geodo.ai) ──

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  // Only handle QUERY_KNOWLEDGE from external sources
  if (message.type === 'QUERY_KNOWLEDGE') {
    handleMessage(message).then(sendResponse);
    return true;
  }
  sendResponse({ error: 'Only QUERY_KNOWLEDGE is supported externally' });
  return false;
});

// ── Alarms ──

chrome.alarms.create('process-queue', { periodInMinutes: 1 });
chrome.alarms.create('session-maintenance', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'process-queue') {
    await processExtractionQueue();
  } else if (alarm.name === 'session-maintenance') {
    await pruneOldSessions(30);
  }
});

// ── Lifecycle ──

chrome.runtime.onStartup.addListener(() => {
  startSession();
});

chrome.runtime.onInstalled.addListener(() => {
  startSession();
});

console.log('Geodo Knowledge Capture service worker loaded');
