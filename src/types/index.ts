// ── Core Event Model ──

export interface GeodoEvent {
  event_id: string;
  event_name:
    | 'session_start'
    | 'session_end'
    | 'search_executed'
    | 'search_refined'
    | 'results_captured'
    | 'lead_profile_opened'
    | 'profile_data_captured';
  session_id: string;
  user_id: string;
  timestamp: string;
  page_context: {
    url: string;
    platform: 'linkedin_sales_nav' | 'linkedin';
    page_type: 'lead_search' | 'lead_profile' | 'linkedin_profile';
  };
  payload: Record<string, unknown>;
}

export interface EventBatch {
  batch_id: string;
  sent_at: string;
  event_count: number;
  events: GeodoEvent[];
}

export interface AppConfig {
  enabled: boolean;
  api_url?: string;
  api_key?: string;
}

// ── Message Types (content script ↔ service worker) ──

export type MessageType =
  | { type: 'GEODO_EVENT'; event: GeodoEvent }
  | { type: 'GET_SESSION_ID' }
  | { type: 'GET_EVENTS' }
  | { type: 'GET_EVENT_COUNT' }
  | { type: 'GET_CONFIG' }
  | { type: 'SET_CONFIG'; payload: Partial<AppConfig> };
