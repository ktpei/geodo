import { v4 as uuidv4 } from 'uuid';
import { addEvent, getAllEvents, countEvents, getConfig, setConfig } from '@/db';
import type { GeodoEvent, MessageType } from '@/types';

const USER_ID = 'dev_user';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── Session Management ──

let lastActivityTime = Date.now();

async function getOrCreateSessionId(): Promise<string> {
  const stored = await chrome.storage.session.get('session_id');
  if (stored.session_id) {
    return stored.session_id as string;
  }
  return createNewSession();
}

async function createNewSession(): Promise<string> {
  const sessionId = uuidv4();
  await chrome.storage.session.set({ session_id: sessionId });

  const event: GeodoEvent = {
    event_id: uuidv4(),
    event_name: 'session_start',
    session_id: sessionId,
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    page_context: { url: '', platform: 'linkedin_sales_nav', page_type: 'lead_search' },
    payload: { platform: 'linkedin_sales_nav' },
  };
  await addEvent(event);
  console.log('[Geodo] Session started:', sessionId);
  return sessionId;
}

async function endCurrentSession(): Promise<void> {
  const stored = await chrome.storage.session.get('session_id');
  const sessionId = stored.session_id as string | undefined;
  if (!sessionId) return;

  const allEvents = await getAllEvents();
  const sessionEvents = allEvents.filter((e) => e.session_id === sessionId);

  const event: GeodoEvent = {
    event_id: uuidv4(),
    event_name: 'session_end',
    session_id: sessionId,
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    page_context: { url: '', platform: 'linkedin_sales_nav', page_type: 'lead_search' },
    payload: {
      duration_ms: INACTIVITY_TIMEOUT_MS,
      event_count: sessionEvents.length,
    },
  };
  await addEvent(event);
  await chrome.storage.session.remove('session_id');
  console.log('[Geodo] Session ended (inactivity):', sessionId);
}

// ── Message Handler ──

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  lastActivityTime = Date.now();

  // GEODO_EVENT is fire-and-forget: respond immediately so the channel doesn't
  // stay open while the service worker does async IndexedDB work. This eliminates
  // the "message channel closed before response" errors in content scripts.
  if (message.type === 'GEODO_EVENT') {
    sendResponse({ success: true });
    const config = getConfig();
    config.then((cfg) => {
      if (cfg.enabled) addEvent(message.event).catch(console.error);
    });
    return false;
  }

  handleMessage(message).then(sendResponse).catch((err) => {
    console.error('[Geodo] Message handler error:', err);
    sendResponse({ error: String(err) });
  });
  return true;
});

async function handleMessage(message: MessageType): Promise<unknown> {
  const config = await getConfig();

  switch (message.type) {
    case 'GEODO_EVENT': {
      if (!config.enabled) return { success: false, reason: 'disabled' };
      await addEvent(message.event);
      console.log(`[Geodo] Stored event: ${message.event.event_name} (${message.event.event_id})`);
      return { success: true };
    }

    case 'GET_SESSION_ID': {
      if (!config.enabled) return { session_id: null };
      const sessionId = await getOrCreateSessionId();
      return { session_id: sessionId };
    }

    case 'GET_EVENTS': {
      const events = await getAllEvents();
      return { events };
    }

    case 'GET_EVENT_COUNT': {
      const count = await countEvents();
      return { count };
    }

    case 'GET_CONFIG':
      return getConfig();

    case 'SET_CONFIG':
      await setConfig(message.payload);
      return { success: true };

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Event Flush to Backend ──

async function flushEventsToBackend(): Promise<void> {
  const config = await getConfig();
  if (!config.api_url || !config.api_key) return;

  const events = await getAllEvents();
  if (events.length === 0) return;

  const batch = {
    batch_id: uuidv4(),
    sent_at: new Date().toISOString(),
    event_count: events.length,
    events,
  };

  try {
    const res = await fetch(`${config.api_url}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(batch),
    });
    if (res.ok) {
      const data = await res.json() as { received: number };
      console.log(`[Geodo] Flushed ${data.received} events to backend`);
    }
  } catch {
    // Network unavailable — will retry on next alarm
  }
}

// ── Alarms ──

chrome.alarms.create('session-check', { periodInMinutes: 5 });
chrome.alarms.create('flush-events', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'session-check') {
    if (Date.now() - lastActivityTime > INACTIVITY_TIMEOUT_MS) {
      await endCurrentSession();
    }
  } else if (alarm.name === 'flush-events') {
    await flushEventsToBackend();
  }
});

// ── Lifecycle ──

chrome.runtime.onStartup.addListener(() => {
  console.log('[Geodo] Extension started');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Geodo] Extension installed/updated');
});

console.log('[Geodo] Service worker loaded');
