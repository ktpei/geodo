// ── IndexedDB helpers ──

function openGeodoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('geodo-events', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function readAllEvents(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readonly');
    const store = tx.objectStore('events');
    const index = store.index('by-timestamp');
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function readConfig(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('config', 'readonly');
      const store = tx.objectStore('config');
      const req = store.get('app');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

// ── Load Events ──

let allEvents = [];
let geodoConfig = {};

async function loadEvents() {
  try {
    const db = await openGeodoDB();
    [allEvents, geodoConfig] = await Promise.all([readAllEvents(db), readConfig(db)]);
    renderAll(allEvents);
  } catch (e) {
    document.getElementById('event-log').innerHTML =
      `<div class="empty">Could not open event database: ${e.message || e}.<br>Use LinkedIn Sales Navigator first to generate events.</div>`;
    document.getElementById('targeting-content').innerHTML =
      '<div class="empty">No data yet.</div>';
  }
}

// ── Derive Prospecting Profile ──

function deriveProfile(events) {
  const searches = events.filter(e => e.event_name === 'search_executed');
  const refinements = events.filter(e => e.event_name === 'search_refined');
  const profiles = events.filter(e => e.event_name === 'profile_data_captured');
  const sessions = new Set(events.map(e => e.session_id)).size;

  const filterCounts = {};
  for (const ev of searches) {
    const filters = ev.payload?.filters || {};
    for (const [key, vals] of Object.entries(filters)) {
      if (!Array.isArray(vals)) continue;
      if (!filterCounts[key]) filterCounts[key] = {};
      for (const v of vals) {
        filterCounts[key][v] = (filterCounts[key][v] || 0) + 1;
      }
    }
  }

  function topValues(filterKey, n = 8) {
    const counts = filterCounts[filterKey] || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([val, count]) => ({ val, count }));
  }

  const titleCounts = {};
  const companyCounts = {};
  const locationCounts = {};
  for (const ev of profiles) {
    const t = ev.payload?.current_title;
    const c = ev.payload?.current_company;
    const l = ev.payload?.location;
    if (t) titleCounts[t] = (titleCounts[t] || 0) + 1;
    if (c) companyCounts[c] = (companyCounts[c] || 0) + 1;
    if (l) locationCounts[l] = (locationCounts[l] || 0) + 1;
  }

  function topN(obj, n = 6) {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([val, count]) => ({ val, count }));
  }

  const addedInRefinements = {};
  const removedInRefinements = {};
  for (const ev of refinements) {
    const diff = ev.payload?.filter_diff || {};
    for (const [key, vals] of Object.entries(diff.added || {})) {
      if (!Array.isArray(vals)) continue;
      if (!addedInRefinements[key]) addedInRefinements[key] = {};
      for (const v of vals) addedInRefinements[key][v] = (addedInRefinements[key][v] || 0) + 1;
    }
    for (const [key, vals] of Object.entries(diff.removed || {})) {
      if (!Array.isArray(vals)) continue;
      if (!removedInRefinements[key]) removedInRefinements[key] = {};
      for (const v of vals) removedInRefinements[key][v] = (removedInRefinements[key][v] || 0) + 1;
    }
  }

  return {
    sessions,
    searches: searches.length,
    profiles: profiles.length,
    events: events.length,
    confidence: sessions >= 10 ? 'high' : sessions >= 3 ? 'medium' : 'low',
    filters: {
      job_title: topValues('job_title'),
      geography: topValues('geography'),
      seniority: topValues('seniority'),
      company_headcount: topValues('company_headcount'),
      industry: topValues('industry'),
    },
    clicked_titles: topN(titleCounts),
    clicked_companies: topN(companyCounts),
    clicked_locations: topN(locationCounts),
    refinements: { added: addedInRefinements, removed: removedInRefinements, count: refinements.length },
  };
}

// ── Render ──

function renderAll(events) {
  const profile = deriveProfile(events);
  document.getElementById('stat-sessions').textContent = profile.sessions;
  document.getElementById('stat-searches').textContent = profile.searches;
  document.getElementById('stat-profiles').textContent = profile.profiles;
  document.getElementById('stat-events').textContent = profile.events;
  renderTargeting(profile);
  renderEventLog(events);
}

function confidenceBadge(conf) {
  return `<span class="confidence ${conf}">${conf}</span>`;
}

function tagList(items, threshold = 2) {
  if (!items || items.length === 0) return '<span class="tag" style="color:#555">No data yet</span>';
  return items.map(({ val, count }) =>
    `<span class="tag ${count >= threshold ? 'strong' : ''}">${escHtml(val)} <span style="opacity:0.5">${count}</span></span>`
  ).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTargeting(profile) {
  if (profile.events === 0) {
    document.getElementById('targeting-content').innerHTML =
      '<div class="empty">No events captured yet. Use LinkedIn Sales Navigator to start building your profile.</div>';
    return;
  }
  const conf = profile.confidence;
  const html = `
    <div class="card">
      <div class="card-title">Job Titles Searched ${confidenceBadge(conf)}</div>
      <div class="tag-list">${tagList(profile.filters.job_title)}</div>
    </div>
    <div class="card">
      <div class="card-title">Geographies</div>
      <div class="tag-list">${tagList(profile.filters.geography)}</div>
    </div>
    <div class="card">
      <div class="card-title">Seniority Levels</div>
      <div class="tag-list">${tagList(profile.filters.seniority)}</div>
    </div>
    <div class="card">
      <div class="card-title">Company Headcount</div>
      <div class="tag-list">${tagList(profile.filters.company_headcount)}</div>
    </div>
    <div class="card">
      <div class="card-title">Industries</div>
      <div class="tag-list">${tagList(profile.filters.industry)}</div>
    </div>
    ${profile.clicked_titles.length > 0 ? `
    <div class="card">
      <div class="card-title">Titles of Leads Clicked</div>
      <div class="tag-list">${tagList(profile.clicked_titles, 1)}</div>
    </div>` : ''}
    ${profile.clicked_companies.length > 0 ? `
    <div class="card">
      <div class="card-title">Companies of Leads Clicked</div>
      <div class="tag-list">${tagList(profile.clicked_companies, 1)}</div>
    </div>` : ''}
    ${profile.refinements.count > 0 ? `
    <div class="card">
      <div class="card-title">Refinement Patterns (${profile.refinements.count} refinements)</div>
      ${Object.keys(profile.refinements.added).length > 0 ? `
        <div style="font-size:12px;color:#888;margin-bottom:6px">Commonly added:</div>
        <div class="tag-list" style="margin-bottom:10px">
          ${Object.entries(profile.refinements.added).flatMap(([key, vals]) =>
            Object.entries(vals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, c]) =>
              `<span class="tag">+${escHtml(key)}: ${escHtml(v)} <span style="opacity:0.5">${c}</span></span>`
            )
          ).join('')}
        </div>` : ''}
      ${Object.keys(profile.refinements.removed).length > 0 ? `
        <div style="font-size:12px;color:#888;margin-bottom:6px">Commonly removed:</div>
        <div class="tag-list">
          ${Object.entries(profile.refinements.removed).flatMap(([key, vals]) =>
            Object.entries(vals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, c]) =>
              `<span class="tag">-${escHtml(key)}: ${escHtml(v)} <span style="opacity:0.5">${c}</span></span>`
            )
          ).join('')}
        </div>` : ''}
    </div>` : ''}
  `;
  document.getElementById('targeting-content').innerHTML = html;
}

function renderEventLog(events) {
  const logEl = document.getElementById('event-log');
  if (events.length === 0) {
    logEl.innerHTML = '<div class="empty">No events captured yet.</div>';
    return;
  }
  const sorted = [...events].reverse().slice(0, 100);
  logEl.innerHTML = sorted.map(ev => {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    const detail = eventDetail(ev);
    return `<div class="event-row">
      <span class="event-name">${escHtml(ev.event_name)}</span>
      <span class="event-time">${time}</span>
      <span class="event-detail">${escHtml(detail)}</span>
    </div>`;
  }).join('');
}

function eventDetail(ev) {
  const p = ev.payload || {};
  switch (ev.event_name) {
    case 'search_executed': {
      const kw = p.keywords ? `"${p.keywords}" ` : '';
      const fc = Object.keys(p.filters || {}).length;
      return `${kw}${fc} filter${fc !== 1 ? 's' : ''}, ${p.result_count ?? '?'} results`;
    }
    case 'search_refined': {
      const diff = p.filter_diff || {};
      const parts = [];
      if (Object.keys(diff.added || {}).length) parts.push(`+${Object.keys(diff.added).join(', ')}`);
      if (Object.keys(diff.removed || {}).length) parts.push(`-${Object.keys(diff.removed).join(', ')}`);
      return parts.join(' | ') || 'refinement';
    }
    case 'results_captured': return `${(p.result_items || []).length} items`;
    case 'lead_profile_opened': return String(p.profile_url || '').split('/').pop() || '';
    case 'profile_data_captured': return [p.name, p.current_title, p.current_company].filter(Boolean).join(' · ');
    case 'session_start': return `platform: ${p.platform || 'unknown'}`;
    case 'session_end': return `${p.event_count ?? '?'} events`;
    default: return '';
  }
}

// ── Query: backend first, local fallback ──

async function askQuestion(question) {
  const answerBox = document.getElementById('answer-box');
  answerBox.textContent = 'Thinking...';

  // Try backend if configured
  if (geodoConfig.api_url && geodoConfig.api_key) {
    try {
      const res = await fetch(`${geodoConfig.api_url}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${geodoConfig.api_key}`,
        },
        body: JSON.stringify({ question }),
      });
      if (res.ok) {
        const data = await res.json();
        answerBox.textContent = `${data.answer}\n\n[confidence: ${data.confidence} · ${data.sessions_analyzed} session(s)]`;
        return;
      }
    } catch (e) {
      // Network error — fall through to local
    }
  }

  // Local keyword fallback
  answerBox.textContent = answerLocally(question, allEvents);
}

function answerLocally(question, events) {
  const q = question.toLowerCase();
  const profile = deriveProfile(events);

  if (events.length === 0) return 'No events captured yet.';

  const confNote = profile.confidence === 'low'
    ? `\n\n[Low confidence — only ${profile.sessions} session(s). Add backend for AI answers.]`
    : '';

  if (q.match(/title|role|position|job/)) {
    const t = profile.filters.job_title.map(x => x.val).join(', ');
    const c = profile.clicked_titles.map(x => x.val).join(', ');
    return [t && `Search titles: ${t}`, c && `Clicked titles: ${c}`].filter(Boolean).join('\n\n') + confNote || 'No title data yet.';
  }
  if (q.match(/geo|location|country|region/)) {
    const g = profile.filters.geography.map(x => x.val).join(', ');
    return g ? `Geographies: ${g}${confNote}` : 'No geography data yet.';
  }
  if (q.match(/industr/)) {
    const i = profile.filters.industry.map(x => x.val).join(', ');
    return i ? `Industries: ${i}${confNote}` : 'No industry data yet.';
  }
  if (q.match(/size|headcount/)) {
    const h = profile.filters.company_headcount.map(x => x.val).join(', ');
    return h ? `Headcount: ${h}${confNote}` : 'No headcount data yet.';
  }
  if (q.match(/senior|level/)) {
    const s = profile.filters.seniority.map(x => x.val).join(', ');
    return s ? `Seniority: ${s}${confNote}` : 'No seniority data yet.';
  }

  return `Based on ${profile.searches} searches, ${profile.sessions} session(s):\n` +
    `Titles: ${profile.filters.job_title.slice(0, 3).map(x => x.val).join(', ') || 'n/a'}\n` +
    `Geo: ${profile.filters.geography.slice(0, 3).map(x => x.val).join(', ') || 'n/a'}\n` +
    `Seniority: ${profile.filters.seniority.slice(0, 2).map(x => x.val).join(', ') || 'n/a'}${confNote}`;
}

// ── Wire Up ──

document.getElementById('ask-btn').addEventListener('click', () => {
  const q = document.getElementById('query-input').value.trim();
  if (q) askQuestion(q);
});

document.getElementById('query-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('ask-btn').click();
});

// ── Init ──
loadEvents();
