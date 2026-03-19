import type { StoredEvent } from '../db/index.js';

export interface FilterCount {
  val: string;
  count: number;
}

export interface ProspectingProfile {
  sessions: number;
  searches: number;
  profiles_viewed: number;
  total_events: number;
  confidence: 'high' | 'medium' | 'low';
  filters: {
    job_title: FilterCount[];
    geography: FilterCount[];
    seniority: FilterCount[];
    company_headcount: FilterCount[];
    industry: FilterCount[];
  };
  clicked_titles: FilterCount[];
  clicked_companies: FilterCount[];
  clicked_locations: FilterCount[];
  refinement_patterns: {
    added: Record<string, Record<string, number>>;
    removed: Record<string, Record<string, number>>;
    total_refinements: number;
  };
}

function topN(counts: Record<string, number>, n = 10): FilterCount[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([val, count]) => ({ val, count }));
}

export function deriveProfile(events: StoredEvent[]): ProspectingProfile {
  const searches = events.filter(e => e.event_name === 'search_executed');
  const refinements = events.filter(e => e.event_name === 'search_refined');
  const profiles = events.filter(e => e.event_name === 'profile_data_captured');
  const sessions = new Set(events.map(e => e.session_id)).size;

  // Filter value counts across all searches
  const filterCounts: Record<string, Record<string, number>> = {};
  for (const ev of searches) {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    const filters = (p.filters ?? {}) as Record<string, unknown>;
    for (const [key, vals] of Object.entries(filters)) {
      if (!Array.isArray(vals)) continue;
      if (!filterCounts[key]) filterCounts[key] = {};
      for (const v of vals as string[]) {
        filterCounts[key][v] = (filterCounts[key][v] ?? 0) + 1;
      }
    }
  }

  // Clicked lead aggregates
  const titleCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  for (const ev of profiles) {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    const t = p.current_title as string | undefined;
    const c = p.current_company as string | undefined;
    const l = p.location as string | undefined;
    if (t) titleCounts[t] = (titleCounts[t] ?? 0) + 1;
    if (c) companyCounts[c] = (companyCounts[c] ?? 0) + 1;
    if (l) locationCounts[l] = (locationCounts[l] ?? 0) + 1;
  }

  // Refinement patterns
  const added: Record<string, Record<string, number>> = {};
  const removed: Record<string, Record<string, number>> = {};
  for (const ev of refinements) {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    const diff = (p.filter_diff ?? {}) as Record<string, Record<string, string[]>>;
    for (const [k, vals] of Object.entries(diff.added ?? {})) {
      if (!added[k]) added[k] = {};
      for (const v of vals) added[k][v] = (added[k][v] ?? 0) + 1;
    }
    for (const [k, vals] of Object.entries(diff.removed ?? {})) {
      if (!removed[k]) removed[k] = {};
      for (const v of vals) removed[k][v] = (removed[k][v] ?? 0) + 1;
    }
  }

  return {
    sessions,
    searches: searches.length,
    profiles_viewed: profiles.length,
    total_events: events.length,
    confidence: sessions >= 10 ? 'high' : sessions >= 3 ? 'medium' : 'low',
    filters: {
      job_title: topN(filterCounts['job_title'] ?? {}),
      geography: topN(filterCounts['geography'] ?? {}),
      seniority: topN(filterCounts['seniority'] ?? {}),
      company_headcount: topN(filterCounts['company_headcount'] ?? {}),
      industry: topN(filterCounts['industry'] ?? {}),
    },
    clicked_titles: topN(titleCounts),
    clicked_companies: topN(companyCounts),
    clicked_locations: topN(locationCounts),
    refinement_patterns: { added, removed, total_refinements: refinements.length },
  };
}
