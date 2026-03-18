import type { ExtractedContent, SearchFields } from '@/types';
import { joinLines } from './utils';

function extract(): ExtractedContent | null {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') ?? '';
  if (!query) {
    console.log('[Geodo] No query found in URL params');
    return null;
  }

  // Try multiple selector strategies for Google search results
  const selectorStrategies = [
    '#search .g',
    '#rso .g',
    '#rso > div',
    '[data-hveid] h3',
    '.MjjYud .g',
  ];

  const results: string[] = [];

  for (const selector of selectorStrategies) {
    const els = document.querySelectorAll(selector);
    if (els.length > 0) {
      console.log(`[Geodo] Found ${els.length} results with selector: ${selector}`);
      els.forEach((el) => {
        const h3 = el.tagName === 'H3' ? el : el.querySelector('h3');
        const title = h3?.textContent?.trim() ?? '';
        const linkEl = el.tagName === 'H3'
          ? el.closest('a')
          : el.querySelector<HTMLAnchorElement>('a[href]');
        const url = linkEl?.href ?? '';
        if (title && !results.some((r) => r.startsWith(title))) {
          results.push(url ? `${title} (${url})` : title);
        }
      });
      if (results.length > 0) break;
    }
  }

  console.log(`[Geodo] Google search captured: query="${query}", ${results.length} results`);

  const structured: SearchFields = {
    query,
    intent: 'Google search: ' + query,
    results_explored: results.slice(0, 10),
  };

  return {
    category: 'search',
    source: {
      url: window.location.href,
      domain: 'google.com',
      platform: 'google',
      page_type: 'search',
    },
    content: {
      raw_text: joinLines('Query: ' + query, 'Results:', ...results.slice(0, 10)),
      structured,
    },
  };
}

// Extract on page load
const content = extract();
if (content) {
  chrome.runtime.sendMessage({ type: 'CONTENT_EXTRACTED', payload: content })
    .then(() => console.log('[Geodo] Search entry sent to service worker'))
    .catch((err: unknown) => console.error('[Geodo] Failed to send:', err));
}
