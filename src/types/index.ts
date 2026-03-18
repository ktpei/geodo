// ── Knowledge Categories ──

export type KnowledgeCategory =
  | 'communication'
  | 'research'
  | 'workflow'
  | 'domain'
  | 'search';

export type Platform =
  | 'linkedin'
  | 'gmail'
  | 'google'
  | 'youtube'
  | 'other';

// ── Category-Specific Structured Fields ──

export interface CommunicationFields {
  tone: string;
  recipients: string[];
  subject: string;
  template_patterns: string[];
  message_type: 'email' | 'dm' | 'comment';
}

export interface ResearchFields {
  entity_name: string;
  entity_type: 'person' | 'company' | 'industry';
  key_facts: string[];
  role?: string;
  company?: string;
}

export interface WorkflowFields {
  action_type: string;
  tool_used: string;
  sequence_position?: number;
}

export interface DomainFields {
  topic: string;
  summary: string;
  key_points: string[];
}

export interface SearchFields {
  query: string;
  intent: string;
  results_explored: string[];
}

export type StructuredFields =
  | CommunicationFields
  | ResearchFields
  | WorkflowFields
  | DomainFields
  | SearchFields;

// ── Core Data Model ──

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  source: {
    url: string;
    domain: string;
    platform: Platform;
    page_type: string;
  };
  timestamp: string;
  content: {
    raw_text: string;
    structured: StructuredFields;
  };
  context: {
    session_id: string;
    preceding_activity?: string;
    time_spent_ms?: number;
  };
  embedding?: number[];
}

export interface Session {
  id: string;
  start: string;
  end?: string;
  duration_ms?: number;
}

export interface ExtractionQueueItem {
  id: string;
  url: string;
  title: string;
  raw_text: string;
  timestamp: string;
  session_id: string;
}

export interface AppConfig {
  enabled: boolean;
  llm_api_key?: string;
  llm_provider?: 'openai' | 'anthropic';
}

// ── Message Types (content script ↔ service worker) ──

export interface ExtractedContent {
  category: KnowledgeCategory;
  source: KnowledgeEntry['source'];
  content: {
    raw_text: string;
    structured: StructuredFields;
  };
  time_spent_ms?: number;
}

export type MessageType =
  | { type: 'CONTENT_EXTRACTED'; payload: ExtractedContent }
  | { type: 'QUEUE_FOR_LLM'; payload: { url: string; title: string; raw_text: string } }
  | { type: 'QUERY_KNOWLEDGE'; payload: { query: string; category?: KnowledgeCategory; limit?: number } }
  | { type: 'GET_CONFIG' }
  | { type: 'SET_CONFIG'; payload: Partial<AppConfig> }
  | { type: 'GET_STATS' }
  | { type: 'GENERATE_EMBEDDING'; payload: { id: string; text: string } };
