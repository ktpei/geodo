// Generic extractor — runs on all pages not matched by platform-specific extractors.
// Extracts main content using readability heuristics and queues for LLM classification.

function getMainContent(): string {
  // Try common article/content containers
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() ?? '';
      if (text.length > 200) return text.slice(0, 5000);
    }
  }

  // Fallback: extract from body, removing nav/footer/sidebar noise
  const body = document.body.cloneNode(true) as HTMLElement;
  const noiseSelectors = ['nav', 'header', 'footer', 'aside', '.sidebar', '.nav', '.menu', '.ad', '[role="navigation"]'];
  noiseSelectors.forEach((sel) => {
    body.querySelectorAll(sel).forEach((el) => el.remove());
  });

  const text = body.textContent?.trim() ?? '';
  return text.slice(0, 5000);
}

function run() {
  const title = document.title?.trim() ?? '';
  const rawText = getMainContent();

  // Skip pages with very little content
  if (rawText.length < 100) return;

  // Skip likely non-content pages (login, settings, etc.)
  const skipPatterns = ['/login', '/signin', '/signup', '/settings', '/account', '/cart', '/checkout'];
  if (skipPatterns.some((p) => window.location.pathname.includes(p))) return;

  // Queue for LLM classification
  chrome.runtime.sendMessage({
    type: 'QUEUE_FOR_LLM',
    payload: {
      url: window.location.href,
      title,
      raw_text: rawText,
    },
  });
}

// Wait for page to be fully loaded
setTimeout(run, 3000);
