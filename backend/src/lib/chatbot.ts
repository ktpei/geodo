import OpenAI from 'openai';
import type { ProspectingProfile } from './profile.js';
import type { StoredEvent } from '../db/index.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
  return client;
}

const SYSTEM_PROMPT = `You are an AI assistant that analyzes a salesperson's LinkedIn prospecting behavior.
You will be given structured data about their search filters, lead profile views, and search refinements.
Answer questions about their targeting patterns based ONLY on the data provided.
Be specific and evidence-based. If data is sparse or absent, say so clearly — never invent patterns.
Keep answers concise (under 150 words) unless the user requests a detailed breakdown.
Format your answer as plain text, no markdown.`;

export async function askChatbot(
  question: string,
  profile: ProspectingProfile,
  recentSearches: StoredEvent[],
  recentProfiles: StoredEvent[],
): Promise<string> {
  const profileSummary = {
    sessions: profile.sessions,
    searches: profile.searches,
    profiles_viewed: profile.profiles_viewed,
    confidence: profile.confidence,
    top_job_titles: profile.filters.job_title.slice(0, 8).map(t => `${t.val} (${t.count}x)`),
    top_geographies: profile.filters.geography.slice(0, 6).map(g => `${g.val} (${g.count}x)`),
    top_seniority: profile.filters.seniority.slice(0, 4).map(s => `${s.val} (${s.count}x)`),
    top_headcount: profile.filters.company_headcount.slice(0, 4).map(h => `${h.val} (${h.count}x)`),
    top_industries: profile.filters.industry.slice(0, 6).map(i => `${i.val} (${i.count}x)`),
    clicked_titles: profile.clicked_titles.slice(0, 8).map(t => `${t.val} (${t.count}x)`),
    clicked_companies: profile.clicked_companies.slice(0, 6).map(c => `${c.val} (${c.count}x)`),
    total_refinements: profile.refinement_patterns.total_refinements,
  };

  const recentSearchSummary = recentSearches.slice(0, 20).map(ev => {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    return { keywords: p.keywords || '', filters: p.filters, result_count: p.result_count, timestamp: ev.timestamp };
  });

  const recentProfileSummary = recentProfiles.slice(0, 20).map(ev => {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    return { title: p.current_title, company: p.current_company, location: p.location };
  });

  const userMessage = [
    '## Prospecting Profile Summary',
    JSON.stringify(profileSummary, null, 2),
    '',
    '## Recent Searches (most recent first)',
    JSON.stringify(recentSearchSummary, null, 2),
    '',
    '## Recent Lead Profiles Viewed',
    JSON.stringify(recentProfileSummary, null, 2),
    '',
    '## Question',
    question,
  ].join('\n');

  const response = await getClient().chat.completions.create({
    model: 'google/gemini-2.5-flash',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 400,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content?.trim() ?? 'No response generated.';
}
