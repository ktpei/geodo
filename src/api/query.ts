import type { KnowledgeCategory, KnowledgeEntry } from '@/types';
import type { SearchResult } from '@/db/vector-search';

/**
 * Query the Geodo knowledge base from an external context.
 *
 * Usage from another extension or page (via chrome.runtime.sendMessage):
 *
 *   const response = await chrome.runtime.sendMessage(GEODO_EXTENSION_ID, {
 *     type: 'QUERY_KNOWLEDGE',
 *     payload: {
 *       query: 'How does this person approach cold outreach to CTOs?',
 *       category: 'communication',  // optional filter
 *       limit: 5,                   // optional, default 10
 *     },
 *   });
 *
 *   // response.results: Array<{ entry: KnowledgeEntry, score: number }>
 *
 * The query is embedded using the local ONNX model and matched against
 * all stored knowledge entries via cosine similarity.
 */

export interface QueryRequest {
  query: string;
  category?: KnowledgeCategory;
  limit?: number;
}

export interface QueryResponse {
  results: SearchResult[];
  error?: string;
}

// Re-export types for external consumers
export type { KnowledgeEntry, KnowledgeCategory, SearchResult };
