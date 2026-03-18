import type { KnowledgeEntry, KnowledgeCategory, StructuredFields } from '@/types';

interface LLMExtractionInput {
  url: string;
  title: string;
  raw_text: string;
  api_key: string;
  provider: 'openai' | 'anthropic';
}

const SYSTEM_PROMPT = `You are a content classifier for a knowledge base that feeds a digital twin.
Given a webpage's URL, title, and content, classify it into exactly one category and extract structured fields.

Categories:
- "communication": Messages, emails, outreach content the user wrote or received
- "research": Information about specific people, companies, or industries
- "workflow": Tool usage, CRM interactions, process steps
- "domain": Articles, documentation, educational content about a topic
- "search": Search queries and results

Respond with valid JSON only, no markdown:
{
  "category": "<category>",
  "structured": { <category-specific fields> }
}

Category-specific structured fields:
- communication: { "tone": "", "recipients": [], "subject": "", "template_patterns": [], "message_type": "email"|"dm"|"comment" }
- research: { "entity_name": "", "entity_type": "person"|"company"|"industry", "key_facts": [], "role": "", "company": "" }
- workflow: { "action_type": "", "tool_used": "", "sequence_position": null }
- domain: { "topic": "", "summary": "", "key_points": [] }
- search: { "query": "", "intent": "", "results_explored": [] }`;

async function callOpenAI(input: LLMExtractionInput): Promise<{ category: KnowledgeCategory; structured: StructuredFields }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${input.api_key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `URL: ${input.url}\nTitle: ${input.title}\n\nContent:\n${input.raw_text.slice(0, 3000)}` },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

async function callAnthropic(input: LLMExtractionInput): Promise<{ category: KnowledgeCategory; structured: StructuredFields }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.api_key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `URL: ${input.url}\nTitle: ${input.title}\n\nContent:\n${input.raw_text.slice(0, 3000)}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return JSON.parse(content);
}

export async function extractWithLLM(input: LLMExtractionInput): Promise<Omit<KnowledgeEntry, 'id' | 'timestamp' | 'context' | 'embedding'>> {
  const result = input.provider === 'anthropic'
    ? await callAnthropic(input)
    : await callOpenAI(input);

  const domain = new URL(input.url).hostname;

  return {
    category: result.category,
    source: {
      url: input.url,
      domain,
      platform: 'other',
      page_type: result.category,
    },
    content: {
      raw_text: input.raw_text.slice(0, 2000),
      structured: result.structured,
    },
  };
}
