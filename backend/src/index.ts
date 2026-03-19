import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import eventsRouter from './routes/events.js';
import profileRouter from './routes/profile.js';
import chatRouter from './routes/chat.js';
import healthRouter from './routes/health.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/events', eventsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/chat', chatRouter);
app.use('/health', healthRouter);

app.listen(PORT, () => {
  console.log(`[Geodo] Backend running on http://localhost:${PORT}`);
  console.log(`[Geodo] API key: ${process.env.API_KEY ? '***configured***' : 'NOT SET — set API_KEY in .env'}`);
  console.log(`[Geodo] OpenAI:  ${process.env.OPENAI_API_KEY ? '***configured***' : 'NOT SET — set OPENAI_API_KEY in .env'}`);
});
