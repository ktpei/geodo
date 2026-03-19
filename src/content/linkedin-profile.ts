// linkedin-profile.ts
// Instruments standard LinkedIn profiles (/in/*)
// Only captures when navigated from LinkedIn context (referrer guard)

import { v4 as uuidv4 } from 'uuid';
import type { GeodoEvent } from '@/types';

const USER_ID = 'dev_user';

// ── Referrer Guard ──

function isFromLinkedInContext(): boolean {
  const ref = document.referrer;
  return ref.includes('linkedin.com') || ref === '';
  // Empty referrer could mean direct navigation, but we allow it
  // to avoid missing profiles opened from bookmarks or the address bar
  // by a user who was already prospecting. Tighten in V2 if needed.
}

// ── Session ──

let sessionId: string | null = null;


async function getSessionId(): Promise<string> {
  if (sessionId) return sessionId;

  try {
    const stored = await chrome.storage.session.get('session_id');
    if (stored['session_id']) {
      sessionId = stored['session_id'] as string;
      return sessionId;
    }
    const newId = uuidv4();
    await chrome.storage.session.set({ session_id: newId });
    sessionId = newId;

    const startEvent: GeodoEvent = {
      event_id: uuidv4(),
      event_name: 'session_start',
      session_id: newId,
      user_id: USER_ID,
      timestamp: new Date().toISOString(),
      page_context: { url: window.location.href, platform: 'linkedin', page_type: 'linkedin_profile' },
      payload: { platform: 'linkedin' },
    };
    chrome.runtime.sendMessage({ type: 'GEODO_EVENT', event: startEvent });
  } catch {
    if (!sessionId) sessionId = `local_${uuidv4()}`;
  }

  return sessionId!;
}

// ── Event Emission ──

async function emitEvent(
  eventName: GeodoEvent['event_name'],
  payload: Record<string, unknown>,
): Promise<void> {
  const sid = await getSessionId();
  if (!sid) return;

  const event: GeodoEvent = {
    event_id: uuidv4(),
    event_name: eventName,
    session_id: sid,
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    page_context: {
      url: window.location.href,
      platform: 'linkedin',
      page_type: 'linkedin_profile',
    },
    payload,
  };

  try {
    chrome.runtime.sendMessage({ type: 'GEODO_EVENT', event });
  } catch {
    // Service worker may have been terminated
  }
}

// ── Profile Data Extraction ──

interface ProfileData {
  name: string;
  current_title: string;
  current_company: string;
  location?: string;
  connection_degree?: string;
  linkedin_profile_id?: string;
}

function extractLinkedInProfile(): ProfileData | null {
  // Name: LinkedIn uses .text-heading-xlarge on the profile h1
  const name =
    document.querySelector<HTMLElement>('.text-heading-xlarge')?.innerText?.trim() ||
    document.querySelector<HTMLElement>('h1')?.innerText?.trim() ||
    '';

  // Headline (title/role): .text-body-medium below name
  const headlineEls = document.querySelectorAll<HTMLElement>('.text-body-medium');
  const title = headlineEls[0]?.innerText?.trim() || '';

  // Company: look for current experience section
  const company =
    document.querySelector<HTMLElement>(
      '.pv-text-details__right-panel .t-bold span:first-child',
    )?.innerText?.trim() ||
    document.querySelector<HTMLElement>(
      '#experience ~ .pvs-list .t-bold span:first-child',
    )?.innerText?.trim() ||
    '';

  // Location: .text-body-small with geographic-like content
  const locationEls = document.querySelectorAll<HTMLElement>('.text-body-small.inline.t-black--light');
  const location = locationEls[0]?.innerText?.trim() || '';

  // Connection degree
  const degree =
    document.querySelector<HTMLElement>('.dist-value')?.innerText?.trim() || '';

  // Profile ID from URL
  const idMatch = window.location.href.match(/\/in\/([^/?#]+)/);
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

// ── Profile Page Handler ──

const viewedProfiles = new Set<string>();

async function handleProfilePage(): Promise<void> {
  if (!isFromLinkedInContext()) {
    console.log('[Geodo] Profile skipped — not from LinkedIn context:', document.referrer);
    return;
  }

  const profileUrl = window.location.href;
  if (viewedProfiles.has(profileUrl)) return;
  viewedProfiles.add(profileUrl);

  await emitEvent('lead_profile_opened', {
    profile_url: profileUrl,
    source: 'search_result',
  });

  setTimeout(async () => {
    let profileData = extractLinkedInProfile();
    // Retry once for lazy-loading profiles
    if (!profileData) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      profileData = extractLinkedInProfile();
    }
    if (profileData) {
      await emitEvent('profile_data_captured', {
        profile_url: profileUrl,
        ...profileData,
      });
    } else {
      console.warn('[Geodo] Could not extract profile data from:', profileUrl);
    }
  }, 1500);
}

// ── SPA Navigation ──

let currentUrl = window.location.href;

function onUrlChange(): void {
  const newUrl = window.location.href;
  if (newUrl === currentUrl) return;
  currentUrl = newUrl;
  if (newUrl.includes('/in/')) {
    handleProfilePage();
  }
}

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

// ── Init ──

handleProfilePage();
