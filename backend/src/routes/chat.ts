import { Router } from 'express';
import { requireApiKey } from '../lib/auth.js';
import { getAllEvents, queryEvents } from '../db/index.js';
import { deriveProfile } from '../lib/profile.js';
import { askChatbot } from '../lib/chatbot.js';

const router = Router();

router.post('/', requireApiKey, async (req, res) => {
  const { question } = req.body as { question?: string };
  if (!question?.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const allEvents = getAllEvents();
    const profile = deriveProfile(allEvents);
    const recentSearches = queryEvents({ event_name: 'search_executed', limit: 20 });
    const recentProfiles = queryEvents({ event_name: 'profile_data_captured', limit: 20 });

    const answer = await askChatbot(question, profile, recentSearches, recentProfiles);
    res.json({ answer, confidence: profile.confidence, sessions_analyzed: profile.sessions });
  } catch (err) {
    console.error('[Geodo] Chat error:', err);
    res.status(500).json({ error: 'Failed to generate answer. Check OPENAI_API_KEY.' });
  }
});

export default router;
