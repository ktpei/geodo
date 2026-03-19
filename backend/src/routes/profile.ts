import { Router } from 'express';
import { requireApiKey } from '../lib/auth.js';
import { getAllEvents } from '../db/index.js';
import { deriveProfile } from '../lib/profile.js';

const router = Router();

router.get('/', requireApiKey, (_req, res) => {
  const events = getAllEvents();
  const profile = deriveProfile(events);
  res.json(profile);
});

export default router;
