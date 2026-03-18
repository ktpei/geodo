interface StatsResponse {
  total: number;
  byCategory: Record<string, number>;
}

interface ConfigResponse {
  enabled: boolean;
  llm_api_key?: string;
  llm_provider?: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function loadStats() {
  const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' }) as StatsResponse;
  $('#total-count').textContent = String(stats.total);
  $('#count-communication').textContent = String(stats.byCategory.communication ?? 0);
  $('#count-research').textContent = String(stats.byCategory.research ?? 0);
  $('#count-workflow').textContent = String(stats.byCategory.workflow ?? 0);
  $('#count-domain').textContent = String(stats.byCategory.domain ?? 0);
  $('#count-search').textContent = String(stats.byCategory.search ?? 0);
}

async function loadConfig() {
  const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' }) as ConfigResponse;
  $<HTMLInputElement>('#enabled-toggle').checked = config.enabled;
  $<HTMLInputElement>('#api-key-input').value = config.llm_api_key ?? '';
  $<HTMLSelectElement>('#provider-select').value = config.llm_provider ?? 'openai';
}

// Toggle enabled state
$('#enabled-toggle').addEventListener('change', async (e) => {
  const enabled = (e.target as HTMLInputElement).checked;
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', payload: { enabled } });
});

// Save API key and provider
$('#save-btn').addEventListener('click', async () => {
  const llm_api_key = $<HTMLInputElement>('#api-key-input').value.trim();
  const llm_provider = $<HTMLSelectElement>('#provider-select').value as 'openai' | 'anthropic';
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', payload: { llm_api_key, llm_provider } });
  const btn = $('#save-btn');
  btn.textContent = 'Saved';
  setTimeout(() => { btn.textContent = 'Save'; }, 1500);
});

// Load on open
loadStats();
loadConfig();
