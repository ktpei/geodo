import type { ExtractedContent, DomainFields } from '@/types';
import { joinLines } from './utils';

function isVideoPage(): boolean {
  return window.location.pathname === '/watch';
}

function extractVideo(): ExtractedContent | null {
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ??
                  document.querySelector('#title h1') ??
                  document.querySelector('h1.title');
  const channelEl = document.querySelector('#channel-name yt-formatted-string a') ??
                    document.querySelector('.ytd-channel-name a');
  const descriptionEl = document.querySelector('#description-inline-expander yt-formatted-string') ??
                        document.querySelector('#description');

  const title = titleEl?.textContent?.trim() ?? '';
  if (!title) return null;

  const channel = channelEl?.textContent?.trim() ?? '';
  const description = descriptionEl?.textContent?.trim()?.slice(0, 1000) ?? '';

  const durationEl = document.querySelector('.ytp-time-duration');
  const duration = durationEl?.textContent?.trim() ?? '';

  const keyPoints: string[] = [];
  if (channel) keyPoints.push('Channel: ' + channel);
  if (duration) keyPoints.push('Duration: ' + duration);
  if (description) keyPoints.push(description.slice(0, 300));

  const structured: DomainFields = {
    topic: title,
    summary: title + ' by ' + channel,
    key_points: keyPoints,
  };

  return {
    category: 'domain',
    source: {
      url: window.location.href,
      domain: 'youtube.com',
      platform: 'youtube',
      page_type: 'video',
    },
    content: {
      raw_text: joinLines('Video: ' + title, 'Channel: ' + channel, 'Duration: ' + duration, '', description),
      structured,
    },
  };
}

function run() {
  if (!isVideoPage()) return;
  setTimeout(() => {
    const content = extractVideo();
    if (content) {
      chrome.runtime.sendMessage({ type: 'CONTENT_EXTRACTED', payload: content });
    }
  }, 3000);
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
