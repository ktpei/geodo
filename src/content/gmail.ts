import type { ExtractedContent, CommunicationFields, DomainFields } from '@/types';
import { joinLines } from './utils';

function detectPageType(): 'compose' | 'reading' | 'inbox' | 'unknown' {
  if (document.querySelector('.AD [name="to"]') ||
      document.querySelector('.dC [name="to"]')) {
    return 'compose';
  }
  if (document.querySelector('.a3s.aiL') ||
      document.querySelector('.gs .ii.gt')) {
    return 'reading';
  }
  return 'inbox';
}

function extractCompose(): ExtractedContent | null {
  const toEl = document.querySelector<HTMLInputElement>('[name="to"]');
  const subjectEl = document.querySelector<HTMLInputElement>('[name="subjectbox"]');
  const bodyEl = document.querySelector('.Am.Al.editable') ??
                 document.querySelector('[aria-label="Message Body"]');

  const to = toEl?.value?.trim() ?? '';
  const subject = subjectEl?.value?.trim() ?? '';
  const body = bodyEl?.textContent?.trim() ?? '';

  if (!body && !subject) return null;

  const recipients = to.split(',').map((r) => r.trim()).filter(Boolean);

  const structured: CommunicationFields = {
    tone: '',
    recipients,
    subject,
    template_patterns: [],
    message_type: 'email',
  };

  return {
    category: 'communication',
    source: {
      url: window.location.href,
      domain: 'mail.google.com',
      platform: 'gmail',
      page_type: 'compose',
    },
    content: {
      raw_text: joinLines('To: ' + to, 'Subject: ' + subject, '', body),
      structured,
    },
  };
}

function extractReading(): ExtractedContent | null {
  const subjectEl = document.querySelector('h2.hP') ??
                    document.querySelector('.ha h2');
  const subject = subjectEl?.textContent?.trim() ?? '';

  const senderEl = document.querySelector('.gD') ??
                   document.querySelector('[email]');
  const sender = senderEl?.getAttribute('email') ??
                 senderEl?.textContent?.trim() ?? '';

  const bodyEl = document.querySelector('.a3s.aiL') ??
                 document.querySelector('.gs .ii.gt');
  const body = bodyEl?.textContent?.trim() ?? '';

  if (!body && !subject) return null;

  const userEmail = document.querySelector('[data-email]')?.getAttribute('data-email') ?? '';
  const isOwnEmail = sender === userEmail;

  if (isOwnEmail) {
    const structured: CommunicationFields = {
      tone: '',
      recipients: [],
      subject,
      template_patterns: [],
      message_type: 'email',
    };

    return {
      category: 'communication',
      source: {
        url: window.location.href,
        domain: 'mail.google.com',
        platform: 'gmail',
        page_type: 'sent',
      },
      content: {
        raw_text: joinLines('Subject: ' + subject, '', body.slice(0, 2000)),
        structured,
      },
    };
  }

  const structured: DomainFields = {
    topic: subject,
    summary: body.slice(0, 500),
    key_points: [],
  };

  return {
    category: 'domain',
    source: {
      url: window.location.href,
      domain: 'mail.google.com',
      platform: 'gmail',
      page_type: 'reading',
    },
    content: {
      raw_text: joinLines('From: ' + sender, 'Subject: ' + subject, '', body.slice(0, 2000)),
      structured,
    },
  };
}

function extract(): ExtractedContent | null {
  const pageType = detectPageType();
  switch (pageType) {
    case 'compose': return extractCompose();
    case 'reading': return extractReading();
    default: return null;
  }
}

let lastHash = window.location.hash;
let extractTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleExtraction() {
  if (extractTimeout) clearTimeout(extractTimeout);
  extractTimeout = setTimeout(() => {
    const content = extract();
    if (content) {
      chrome.runtime.sendMessage({ type: 'CONTENT_EXTRACTED', payload: content });
    }
  }, 2000);
}

scheduleExtraction();

const observer = new MutationObserver(() => {
  if (window.location.hash !== lastHash) {
    lastHash = window.location.hash;
    scheduleExtraction();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
