import { Router } from 'express';
import { requireApiKey } from '../lib/auth.js';
import { insertEvent, queryEvents } from '../db/index.js';

const router = Router();

interface GeodoEvent {
  event_id: string;
  event_name: string;
  session_id: string;
  user_id: string;
  timestamp: string;
  page_context?: { url?: string; platform?: string; page_type?: string };
  payload: Record<string, unknown>;
}

// POST /api/events — ingest batch
router.post('/', requireApiKey, (req, res) => {
  const batch = req.body as { events?: GeodoEvent[] };
  if (!Array.isArray(batch.events)) {
    res.status(400).json({ error: 'events array required' });
    return;
  }

  let received = 0;
  let duplicate = 0;

  for (const ev of batch.events) {
    if (!ev.event_id || !ev.event_name || !ev.session_id) continue;
    const inserted = insertEvent({
      event_id: ev.event_id,
      user_id: ev.user_id || 'dev_user',
      session_id: ev.session_id,
      event_name: ev.event_name,
      timestamp: ev.timestamp || new Date().toISOString(),
      platform: ev.page_context?.platform,
      page_type: ev.page_context?.page_type,
      url: ev.page_context?.url,
      payload: ev.payload || {},
    });
    if (inserted) received++; else duplicate++;
  }

  res.json({ received, duplicate });
});

// GET /api/events — list events
router.get('/', requireApiKey, (req, res) => {
  const { event_name, session_id, limit } = req.query;
  const events = queryEvents({
    event_name: event_name as string | undefined,
    session_id: session_id as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : 100,
  });
  res.json({ events: events.map(e => ({ ...e, payload: JSON.parse(e.payload) })) });
});

export default router;
