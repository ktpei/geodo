import type { ExtractedContent, ResearchFields, CommunicationFields, SearchFields } from '@/types';
import { joinLines, NL } from './utils';

function detectPageType(): 'profile' | 'company' | 'messaging' | 'search' | 'feed' | 'unknown' {
  const path = window.location.pathname;
  if (path.startsWith('/in/')) return 'profile';
  if (path.startsWith('/company/')) return 'company';
  if (path.startsWith('/messaging/')) return 'messaging';
  if (path.startsWith('/search/')) return 'search';
  if (path === '/feed/' || path === '/feed') return 'feed';
  return 'unknown';
}

function extractProfile(): ExtractedContent | null {
  const nameEl = document.querySelector('.text-heading-xlarge') ??
                  document.querySelector('h1.inline');
  const headlineEl = document.querySelector('.text-body-medium') ??
                     document.querySelector('.top-card-layout__headline');
  const aboutEl = document.querySelector('#about ~ div .inline-show-more-text') ??
                  document.querySelector('.pv-about-section .pv-about__summary-text');

  const name = nameEl?.textContent?.trim() ?? '';
  const headline = headlineEl?.textContent?.trim() ?? '';
  const about = aboutEl?.textContent?.trim() ?? '';

  if (!name) return null;

  const experienceItems = document.querySelectorAll('#experience ~ div li.artdeco-list__item');
  const experiences: string[] = [];
  experienceItems.forEach((item) => {
    const text = item.textContent?.trim();
    if (text) experiences.push(text.slice(0, 200));
  });

  const headlineParts = headline.split(' at ');
  const role = headlineParts[0]?.trim();
  const company = headlineParts[1]?.trim();

  const keyFacts: string[] = [];
  if (headline) keyFacts.push(headline);
  if (about) keyFacts.push(about.slice(0, 500));
  experiences.slice(0, 3).forEach((exp) => keyFacts.push(exp));

  const structured: ResearchFields = {
    entity_name: name,
    entity_type: 'person',
    key_facts: keyFacts,
    role,
    company,
  };

  return {
    category: 'research',
    source: {
      url: window.location.href,
      domain: 'linkedin.com',
      platform: 'linkedin',
      page_type: 'profile',
    },
    content: {
      raw_text: joinLines(name, headline, about, ...experiences),
      structured,
    },
  };
}

function extractCompany(): ExtractedContent | null {
  const nameEl = document.querySelector('h1.org-top-card-summary__title') ??
                 document.querySelector('h1');
  const industryEl = document.querySelector('.org-top-card-summary-info-list__info-item');
  const aboutEl = document.querySelector('.org-about-us-organization-description__text');

  const name = nameEl?.textContent?.trim() ?? '';
  if (!name) return null;

  const industry = industryEl?.textContent?.trim() ?? '';
  const about = aboutEl?.textContent?.trim() ?? '';

  const keyFacts: string[] = [];
  if (industry) keyFacts.push('Industry: ' + industry);
  if (about) keyFacts.push(about.slice(0, 500));

  const structured: ResearchFields = {
    entity_name: name,
    entity_type: 'company',
    key_facts: keyFacts,
  };

  return {
    category: 'research',
    source: {
      url: window.location.href,
      domain: 'linkedin.com',
      platform: 'linkedin',
      page_type: 'company',
    },
    content: {
      raw_text: joinLines(name, industry, about),
      structured,
    },
  };
}

function extractMessaging(): ExtractedContent | null {
  const threadEl = document.querySelector('.msg-conversation-card__content--selectable.active') ??
                   document.querySelector('.msg-conversation-listitem__link--active');
  const messagesContainer = document.querySelector('.msg-s-message-list-content');

  if (!messagesContainer) return null;

  const messages = messagesContainer.querySelectorAll('.msg-s-event-listitem');
  const messageTexts: string[] = [];
  const recipients: string[] = [];

  messages.forEach((msg) => {
    const senderEl = msg.querySelector('.msg-s-message-group__profile-link');
    const bodyEl = msg.querySelector('.msg-s-event-listitem__body');
    const sender = senderEl?.textContent?.trim() ?? '';
    const body = bodyEl?.textContent?.trim() ?? '';
    if (sender && !recipients.includes(sender)) recipients.push(sender);
    if (body) messageTexts.push(body.slice(0, 500));
  });

  if (messageTexts.length === 0) return null;

  const subject = threadEl?.textContent?.trim()?.slice(0, 100) ?? 'LinkedIn conversation';

  const structured: CommunicationFields = {
    tone: '',
    recipients,
    subject,
    template_patterns: [],
    message_type: 'dm',
  };

  return {
    category: 'communication',
    source: {
      url: window.location.href,
      domain: 'linkedin.com',
      platform: 'linkedin',
      page_type: 'messaging',
    },
    content: {
      raw_text: messageTexts.join(NL + '---' + NL),
      structured,
    },
  };
}

function extractSearch(): ExtractedContent | null {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('keywords') ?? '';
  if (!query) return null;

  const resultEls = document.querySelectorAll('.reusable-search__result-container');
  const results: string[] = [];
  resultEls.forEach((el) => {
    const text = el.querySelector('.entity-result__title-text')?.textContent?.trim();
    if (text) results.push(text.slice(0, 100));
  });

  const structured: SearchFields = {
    query,
    intent: 'LinkedIn search for: ' + query,
    results_explored: results.slice(0, 10),
  };

  return {
    category: 'search',
    source: {
      url: window.location.href,
      domain: 'linkedin.com',
      platform: 'linkedin',
      page_type: 'search',
    },
    content: {
      raw_text: 'Search: ' + query + NL + 'Results: ' + results.join(', '),
      structured,
    },
  };
}

function extract(): ExtractedContent | null {
  const pageType = detectPageType();
  switch (pageType) {
    case 'profile': return extractProfile();
    case 'company': return extractCompany();
    case 'messaging': return extractMessaging();
    case 'search': return extractSearch();
    default: return null;
  }
}

function run() {
  setTimeout(() => {
    const content = extract();
    if (content) {
      chrome.runtime.sendMessage({ type: 'CONTENT_EXTRACTED', payload: content });
    }
  }, 2000);
}

run();

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    run();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
