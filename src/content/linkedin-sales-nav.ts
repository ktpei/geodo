// linkedin-sales-nav.ts
// Instruments LinkedIn Sales Navigator people search (/sales/search/people*)
// and lead profiles (/sales/lead/*)

import { v4 as uuidv4 } from 'uuid';
import type { GeodoEvent } from '@/types';

const USER_ID = 'dev_user';
const MAX_RESULT_ITEMS = 10;

// ── Session ──

let sessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (sessionId) return sessionId;

  try {
    // Read directly from storage — no service worker roundtrip needed
    const stored = await chrome.storage.session.get('session_id');
    if (stored['session_id']) {
      sessionId = stored['session_id'] as string;
      return sessionId;
    }

    // No active session — create one locally
    const newId = uuidv4();
    await chrome.storage.session.set({ session_id: newId });
    sessionId = newId;

    // Emit session_start (fire-and-forget)
    const startEvent: GeodoEvent = {
      event_id: uuidv4(),
      event_name: 'session_start',
      session_id: newId,
      user_id: USER_ID,
      timestamp: new Date().toISOString(),
      page_context: { url: window.location.href, platform: 'linkedin_sales_nav', page_type: 'lead_search' },
      payload: { platform: 'linkedin_sales_nav' },
    };
    chrome.runtime.sendMessage({ type: 'GEODO_EVENT', event: startEvent });
  } catch {
    // Absolute fallback — use a tab-local id so events still fire
    if (!sessionId) sessionId = `local_${uuidv4()}`;
  }

  return sessionId!;
}

// ── Event Emission ──

function getPageContext(): GeodoEvent['page_context'] {
  const url = window.location.href;
  const pageType = url.includes('/sales/search/') ? 'lead_search' : 'lead_profile';
  return { url, platform: 'linkedin_sales_nav', page_type: pageType };
}

async function emitEvent(eventName: GeodoEvent['event_name'], payload: Record<string, unknown>): Promise<void> {
  const sid = await getSessionId();
  if (!sid) return;

  const event: GeodoEvent = {
    event_id: uuidv4(),
    event_name: eventName,
    session_id: sid,
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    page_context: getPageContext(),
    payload,
  };

  try {
    chrome.runtime.sendMessage({ type: 'GEODO_EVENT', event });
  } catch {
    // Service worker may have been terminated
  }
}

// ── Filter State Parsing ──

const FILTER_TYPE_MAP: Record<string, string> = {
  CURRENT_TITLE: 'job_title',
  GEOGRAPHY: 'geography',
  SENIORITY_LEVEL: 'seniority',
  COMPANY_HEADCOUNT: 'company_headcount',
  INDUSTRY: 'industry',
  CURRENT_COMPANY: 'current_company',
  FUNCTION: 'function',
};

function parseLinkedInQuery(queryParam: string): { keywords: string; filters: Record<string, string[]> } {
  const filters: Record<string, string[]> = {};
  let keywords = '';

  try {
    const decoded = decodeURIComponent(queryParam);

    // Extract keywords
    const kwMatch = decoded.match(/keywords:([^,)]+)/);
    if (kwMatch) keywords = kwMatch[1].replace(/\+/g, ' ').trim();

    // Find all type:TYPENAME occurrences and extract text values between them
    const typeMatches = [...decoded.matchAll(/type:([A-Z_]+)/g)];
    for (let i = 0; i < typeMatches.length; i++) {
      const typeMatch = typeMatches[i];
      const filterType = typeMatch[1];
      const ourType = FILTER_TYPE_MAP[filterType];
      if (!ourType) continue;

      const startPos = typeMatch.index! + typeMatch[0].length;
      const nextTypePos = typeMatches[i + 1]?.index ?? decoded.length;
      const block = decoded.substring(startPos, nextTypePos);

      const textVals = [...block.matchAll(/text:([^,)]+)/g)].map((m) =>
        m[1].replace(/\+/g, ' ').trim(),
      );
      if (textVals.length > 0) filters[ourType] = textVals;
    }
  } catch (e) {
    console.warn('[Geodo] Filter parse error:', e);
  }

  return { keywords, filters };
}

function extractFiltersFromDOM(): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  // Collect applied filter pill labels — type mapping is best-effort without URL params
  const pills = document.querySelectorAll(
    '[data-x-search-filter="true"], .artdeco-pill--choice[aria-pressed="true"]',
  );
  const labels: string[] = [];
  for (const pill of Array.from(pills)) {
    const label = pill.getAttribute('aria-label') || pill.textContent?.trim() || '';
    if (label) labels.push(label);
  }
  if (labels.length > 0) filters['applied_filters'] = labels;
  return filters;
}

function getFilterState(): { keywords: string; filters: Record<string, string[]> } {
  try {
    const url = new URL(window.location.href);
    const queryParam = url.searchParams.get('query') || '';
    if (queryParam) {
      const parsed = parseLinkedInQuery(queryParam);
      if (Object.keys(parsed.filters).length > 0 || parsed.keywords) {
        return parsed;
      }
    }
  } catch {
    // Fall through to DOM
  }
  return { keywords: '', filters: extractFiltersFromDOM() };
}

function hashFilterState(state: { keywords: string; filters: Record<string, string[]> }): string {
  return JSON.stringify({ k: state.keywords, f: state.filters });
}

// ── Result Count ──

function extractResultCount(): number {
  const candidates = [
    document.querySelector('[data-x-search-total-results]')?.getAttribute('data-x-search-total-results'),
    document.querySelector('.search-results__total')?.textContent,
    document.querySelector('.t-16.t-black.t-bold')?.textContent,
  ];
  for (const text of candidates) {
    if (!text) continue;
    const match = text.match(/[\d,]+/);
    if (match) return parseInt(match[0].replace(/,/g, ''), 10);
  }
  return 0;
}

// ── Result Items ──

interface ResultItem {
  name: string;
  title: string;
  company: string;
  location: string;
  connection_degree?: string;
}

function extractResultItems(): ResultItem[] {
  const items: ResultItem[] = [];
  // Sales Navigator result cards use data-anonymize attributes for stability
  const cards = document.querySelectorAll(
    '[data-x-search-result="TYPE_PERSON"], .artdeco-list__item',
  );

  for (const card of Array.from(cards).slice(0, MAX_RESULT_ITEMS)) {
    const name =
      card.querySelector('[data-anonymize="person-name"]')?.textContent?.trim() ||
      card.querySelector('.artdeco-entity-lockup__title span')?.textContent?.trim() ||
      '';
    const title =
      card.querySelector('[data-anonymize="job-title"]')?.textContent?.trim() ||
      card.querySelector('.artdeco-entity-lockup__subtitle')?.textContent?.trim() ||
      '';
    const company =
      card.querySelector('[data-anonymize="company-name"]')?.textContent?.trim() ||
      '';
    const location =
      card.querySelector('[data-anonymize="location"]')?.textContent?.trim() ||
      card.querySelector('.artdeco-entity-lockup__caption')?.textContent?.trim() ||
      '';
    const degree =
      card.querySelector('[data-anonymize="connection-distance"]')?.textContent?.trim() || '';

    if (name || title) {
      const item: ResultItem = { name, title, company, location };
      if (degree) item.connection_degree = degree;
      items.push(item);
    }
  }
  return items;
}

// ── Profile Data (Sales Nav) ──

interface ProfileData {
  name: string;
  current_title: string;
  current_company: string;
  location?: string;
  connection_degree?: string;
  linkedin_profile_id?: string;
}

function extractSalesNavProfile(): ProfileData | null {
  const name =
    document.querySelector('[data-anonymize="person-name"]')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    '';
  const title =
    document.querySelector('[data-anonymize="job-title"]')?.textContent?.trim() ||
    document.querySelector('.artdeco-entity-lockup__title')?.textContent?.trim() ||
    '';
  const company =
    document.querySelector('[data-anonymize="company-name"]')?.textContent?.trim() ||
    document.querySelector('.artdeco-entity-lockup__subtitle')?.textContent?.trim() ||
    '';
  const location =
    document.querySelector('[data-anonymize="location"]')?.textContent?.trim() ||
    document.querySelector('.artdeco-entity-lockup__caption')?.textContent?.trim() ||
    '';
  const degree =
    document.querySelector('[data-anonymize="connection-distance"]')?.textContent?.trim() || '';

  const idMatch = window.location.href.match(/\/sales\/lead\/([^/?#,]+)/);
  const profileId = idMatch?.[1] || '';

  if (!name && !title) return null;

  return {
    name,
    current_title: title,
    current_company: company,
    ...(location && { location }),
    ...(degree && { connection_degree: degree }),
    ...(profileId && { linkedin_profile_id: profileId }),
  };
}

// ── State Tracking ──

let lastFilterHash: string | null = null;
let lastFilterState: { keywords: string; filters: Record<string, string[]> } | null = null;
let lastSearchId: string | null = null;
let lastResultCount = 0;
const viewedProfiles = new Set<string>();

// ── Page Handlers ──

async function handleSearchPage(): Promise<void> {
  const filterState = getFilterState();
  const filterHash = hashFilterState(filterState);

  if (filterHash === lastFilterHash) return;

  const searchId = uuidv4();
  const resultCount = extractResultCount();

  if (lastFilterHash === null) {
    await emitEvent('search_executed', {
      search_id: searchId,
      keywords: filterState.keywords,
      filters: filterState.filters,
      result_count: resultCount,
    });
  } else {
    // Compute filter diff
    const prevFilters = lastFilterState?.filters || {};
    const newFilters = filterState.filters;
    const added: Record<string, string[]> = {};
    const removed: Record<string, string[]> = {};

    for (const [key, vals] of Object.entries(newFilters)) {
      const addedVals = vals.filter((v) => !(prevFilters[key] || []).includes(v));
      if (addedVals.length > 0) added[key] = addedVals;
    }
    for (const [key, vals] of Object.entries(prevFilters)) {
      const removedVals = vals.filter((v) => !(newFilters[key] || []).includes(v));
      if (removedVals.length > 0) removed[key] = removedVals;
    }

    await emitEvent('search_refined', {
      filter_diff: { added, removed },
      result_count_before: lastResultCount,
      result_count_after: resultCount,
      keywords_changed: filterState.keywords !== (lastFilterState?.keywords || ''),
    });

    await emitEvent('search_executed', {
      search_id: searchId,
      keywords: filterState.keywords,
      filters: filterState.filters,
      result_count: resultCount,
    });
  }

  lastFilterHash = filterHash;
  lastFilterState = filterState;
  lastSearchId = searchId;
  lastResultCount = resultCount;

  // Capture result items after DOM settles
  setTimeout(async () => {
    const items = extractResultItems();
    if (items.length > 0) {
      await emitEvent('results_captured', {
        search_id: searchId,
        result_items: items,
        page_number: 1,
      });
    }
  }, 2000);
}

async function handleLeadProfilePage(): Promise<void> {
  const profileUrl = window.location.href;
  if (viewedProfiles.has(profileUrl)) return;
  viewedProfiles.add(profileUrl);

  await emitEvent('lead_profile_opened', {
    profile_url: profileUrl,
    source: 'search_result',
    source_search_id: lastSearchId,
  });

  setTimeout(async () => {
    let profileData = extractSalesNavProfile();
    // Retry once if DOM not ready
    if (!profileData) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      profileData = extractSalesNavProfile();
    }
    if (profileData) {
      await emitEvent('profile_data_captured', {
        profile_url: profileUrl,
        ...profileData,
      });
    }
  }, 1500);
}

// ── URL Change Detection (SPA routing) ──

let currentUrl = window.location.href;

function onUrlChange(): void {
  const newUrl = window.location.href;
  if (newUrl === currentUrl) return;
  currentUrl = newUrl;

  if (newUrl.includes('/sales/search/people')) {
    setTimeout(() => handleSearchPage(), 800);
  } else if (newUrl.includes('/sales/lead/')) {
    handleLeadProfilePage();
  }
}

// Intercept History API for SPA navigation
const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);

history.pushState = function (...args) {
  _pushState(...args);
  onUrlChange();
};
history.replaceState = function (...args) {
  _replaceState(...args);
  onUrlChange();
};
window.addEventListener('popstate', onUrlChange);

// MutationObserver as fallback for navigations that bypass history API
const observer = new MutationObserver(onUrlChange);
observer.observe(document.documentElement, { childList: true, subtree: false });

// ── Session End ──

window.addEventListener('beforeunload', () => {
  if (!sessionId) return;
  // Use sendBeacon-style fire-and-forget since page is unloading
  const event: GeodoEvent = {
    event_id: uuidv4(),
    event_name: 'session_end',
    session_id: sessionId,
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    page_context: getPageContext(),
    payload: { event_count: -1 }, // service worker fills actual count
  };
  chrome.runtime.sendMessage({ type: 'GEODO_EVENT', event });
});

// ── Init ──

async function init(): Promise<void> {
  const url = window.location.href;
  if (url.includes('/sales/search/people')) {
    // Wait for DOM to settle before first extraction
    setTimeout(() => handleSearchPage(), 1500);
  } else if (url.includes('/sales/lead/')) {
    handleLeadProfilePage();
  }
}

init();
