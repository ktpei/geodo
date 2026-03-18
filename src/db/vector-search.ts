import type { KnowledgeEntry, KnowledgeCategory } from '@/types';
import { getEntriesWithEmbeddings, getEntriesByCategory } from './index';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
}

export async function searchByEmbedding(
  queryEmbedding: number[],
  options: {
    limit?: number;
    category?: KnowledgeCategory;
    minScore?: number;
  } = {},
): Promise<SearchResult[]> {
  const { limit = 10, category, minScore = 0.3 } = options;

  let entries: KnowledgeEntry[];
  if (category) {
    const catEntries = await getEntriesByCategory(category);
    entries = catEntries.filter((e) => e.embedding && e.embedding.length > 0);
  } else {
    entries = await getEntriesWithEmbeddings();
  }

  const results: SearchResult[] = entries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding!),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

export function composeEmbeddingText(entry: KnowledgeEntry): string {
  const parts: string[] = [];

  parts.push(`[${entry.category}]`);
  parts.push(`Source: ${entry.source.platform} - ${entry.source.page_type}`);

  const s = entry.content.structured;

  if (entry.category === 'communication' && 'tone' in s) {
    parts.push(`Subject: ${s.subject}`);
    parts.push(`Recipients: ${s.recipients.join(', ')}`);
    parts.push(`Type: ${s.message_type}`);
  } else if (entry.category === 'research' && 'entity_name' in s) {
    parts.push(`Entity: ${s.entity_name} (${s.entity_type})`);
    if (s.role) parts.push(`Role: ${s.role}`);
    if (s.company) parts.push(`Company: ${s.company}`);
    parts.push(`Facts: ${s.key_facts.join('; ')}`);
  } else if (entry.category === 'workflow' && 'action_type' in s) {
    parts.push(`Action: ${s.action_type}`);
    parts.push(`Tool: ${s.tool_used}`);
  } else if (entry.category === 'domain' && 'topic' in s) {
    parts.push(`Topic: ${s.topic}`);
    parts.push(`Summary: ${s.summary}`);
    parts.push(`Key points: ${s.key_points.join('; ')}`);
  } else if (entry.category === 'search' && 'query' in s) {
    parts.push(`Query: ${s.query}`);
    parts.push(`Intent: ${s.intent}`);
  }

  if (entry.content.raw_text) {
    // Truncate raw text to keep embedding input reasonable
    const truncated = entry.content.raw_text.slice(0, 1000);
    parts.push(`Content: ${truncated}`);
  }

  return parts.join('\n');
}
