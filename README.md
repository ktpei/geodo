# Geodo

intern project for https://www.geodo.ai/

Chrome extension that captures structured browser knowledge to build your AI digital twin for GTM automation.

## What it does

Geodo monitors your browsing activity — LinkedIn Sales Navigator prospecting, email, research — and extracts structured knowledge into a local database. This knowledge base teaches Geodo's AI digital twin how you work, communicate, and think, so it can replicate your outreach style autonomously.

The extension captures **semantic understanding**, not screenshots or behavior metrics. It extracts contact and company data from LinkedIn to  enrich your **Ideal Customer Profile (ICP)** — learning who you prospect, what patterns emerge, and what your target audience looks like.

## Architecture

```
src/
├── background/       Service worker — session management, event routing
├── content/          Platform-specific extractors
│   ├── linkedin-sales-nav.ts   Sales Navigator profiles & lists
│   ├── linkedin-profile.ts     LinkedIn public profiles
│   ├── linkedin.ts             Shared LinkedIn utilities
│   ├── gmail.ts                Email content extraction
│   ├── google-search.ts        Search query & result capture
│   ├── youtube.ts              Video context extraction
│   ├── contact-extractor.ts    Contact info extraction
│   ├── contact-listener.ts     Contact detection across pages
│   └── generic.ts              LLM fallback for unrecognized pages
├── db/               IndexedDB storage layer
├── api/              External query interface for agents
├── offscreen/        Local ONNX embeddings (all-MiniLM-L6-v2)
├── popup/            Extension popup UI — toggle, stats, config
└── types/            Shared TypeScript types

backend/              Express API server
├── routes/           REST endpoints (contacts, ICP)
├── db/               Server-side storage
└── lib/              Chatbot / LLM integration
```

## Knowledge categories

- **Communication** — email tone, messaging patterns, outreach style
- **Research** — how you evaluate companies, industries, prospects
- **Workflow** — tool usage patterns, process preferences
- **Domain** — industry knowledge, product expertise
- **Search** — what you look for and how you refine queries

## Tech stack

- **Extension:** TypeScript, Vite, Chrome Manifest V3, IndexedDB
- **Embeddings:** Local ONNX via Transformers.js (all-MiniLM-L6-v2) — no external API
- **Backend:** Express, OpenAI SDK, TypeScript
- **Build:** [@crxjs/vite-plugin](https://github.com/nicedoc/crxjs) for HMR during development

## Getting started

```bash
# Install dependencies
npm install
cd backend && npm install && cd ..

# Run the extension in dev mode
npm run dev

# Run the backend
cd backend && npm run dev

# Build for production
npm run build
```

Load the built extension in Chrome via `chrome://extensions` → "Load unpacked" → select the `dist/` folder.

## Data ownership

All captured knowledge is stored locally in the browser's IndexedDB. The user installs voluntarily and owns their data. No data leaves the device unless explicitly synced to the backend.
