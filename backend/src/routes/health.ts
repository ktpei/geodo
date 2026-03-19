import { Router } from 'express';
import { countEvents } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, events: countEvents() });
});

export default router;
