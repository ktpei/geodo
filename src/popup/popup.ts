const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function loadEventCount() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_EVENT_COUNT' });
    $('#event-count').textContent = String(response?.count ?? 0);
  } catch {
    $('#event-count').textContent = '—';
  }
}

async function loadConfig() {
  try {
    const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    $<HTMLInputElement>('#enabled-toggle').checked = config?.enabled ?? true;
    $<HTMLInputElement>('#api-url-input').value = config?.api_url ?? '';
    $<HTMLInputElement>('#api-key-input').value = config?.api_key ?? '';
  } catch {
    // Service worker may be initializing
  }
}

$('#enabled-toggle').addEventListener('change', async (e) => {
  const enabled = (e.target as HTMLInputElement).checked;
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', payload: { enabled } });
});

$('#save-btn').addEventListener('click', async () => {
  const api_url = $<HTMLInputElement>('#api-url-input').value.trim().replace(/\/$/, '');
  const api_key = $<HTMLInputElement>('#api-key-input').value.trim();
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', payload: { api_url, api_key } });
  const btn = $('#save-btn');
  btn.textContent = 'Saved';
  setTimeout(() => { btn.textContent = 'Save'; }, 1500);
});

$('#open-insights').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('mock-web/index.html') });
});

loadEventCount();
loadConfig();
