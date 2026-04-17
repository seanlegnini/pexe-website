// ========================================
// PEXE Lab — Feed Aggregator
// Substack JSON API (no proxy) + Podcast RSS
// ========================================

const SUBSTACK_FEEDS = [
  {
    subdomain: 'seanisdwelling',
    source: 'Sean Legnini',
    type: 'essay'
  },
  {
    subdomain: 'matthewkr',
    source: 'Matthew Kruger-Ross',
    type: 'essay'
  },
  {
    subdomain: 'pexelab',
    source: 'PEXE Roundup',
    type: 'roundup'
  }
];

const PODCAST_APPLE_ID = '1876957994';
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const CACHE_KEY = 'pexe_feed_cache_v2';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Helper: fetch through CORS proxies with timeout and fallback
async function proxyFetch(url, timeoutMs = 6000) {
  let lastErr;
  for (const wrap of CORS_PROXIES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(wrap(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('all proxies failed');
}

// Fetch Substack posts via JSON API through CORS proxy
async function fetchSubstack(feed) {
  try {
    const url = `https://${feed.subdomain}.substack.com/api/v1/posts?limit=3`;
    const raw = await proxyFetch(url);
    const posts = JSON.parse(raw);
    return posts.map(post => ({
      title: post.title,
      link: post.canonical_url || `https://${feed.subdomain}.substack.com/p/${post.slug}`,
      date: new Date(post.post_date),
      source: feed.source,
      type: feed.type,
      description: post.subtitle || post.description || post.truncated_body_text || ''
    }));
  } catch (err) {
    console.warn(`Failed to fetch ${feed.source}:`, err);
    return [];
  }
}

// Fetch podcast episodes via Apple iTunes Lookup API (no proxy needed)
async function fetchPodcast() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const url = `https://itunes.apple.com/lookup?id=${PODCAST_APPLE_ID}&media=podcast&entity=podcastEpisode&limit=3`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results
      .filter(r => r.wrapperType === 'podcastEpisode')
      .map(ep => ({
        title: ep.trackName,
        link: ep.trackViewUrl || ep.collectionViewUrl,
        date: new Date(ep.releaseDate),
        source: 'The Line',
        type: 'podcast',
        description: ep.description || ep.shortDescription || ''
      }));
  } catch (err) {
    console.warn('Failed to fetch podcast:', err);
    return [];
  }
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function badgeClass(type) {
  return `feed-item__badge feed-item__badge--${type}`;
}

function badgeLabel(type) {
  const labels = { podcast: 'PODCAST', essay: 'ESSAY', roundup: 'ROUNDUP' };
  return labels[type] || 'POST';
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || tmp.innerText || '').trim();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getCachedFeed() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) return null;
    cached.items.forEach(item => { item.date = new Date(item.date); });
    return cached.items;
  } catch { return null; }
}

function setCachedFeed(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* storage full — ignore */ }
}

async function fetchAllFeeds() {
  const allItems = [];
  const results = await Promise.allSettled([
    ...SUBSTACK_FEEDS.map(f => fetchSubstack(f)),
    fetchPodcast()
  ]);
  results.forEach(r => {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  });
  allItems.sort((a, b) => b.date - a.date);
  return allItems.slice(0, 6);
}

async function loadFeeds() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // Show cached content immediately if available
  const cached = getCachedFeed();
  if (cached && cached.length > 0) {
    renderFeed(container, cached);
    fetchAllFeeds().then(items => {
      if (items.length > 0) {
        setCachedFeed(items);
        renderFeed(container, items);
      }
    });
    return;
  }

  container.innerHTML = '<p class="feed-loading">Loading latest from PEXE…</p>';

  const display = await fetchAllFeeds();
  if (display.length > 0) setCachedFeed(display);
  renderFeed(container, display);
}

function renderFeed(container, items) {
  if (items.length === 0) {
    container.innerHTML = `
      <a class="feed-item" href="https://podcasts.apple.com/us/podcast/the-line/id1876957994?i=1000760455039" target="_blank" rel="noopener">
        <div class="feed-item__meta">
          <span class="${badgeClass('podcast')}">PODCAST</span>
          <span class="feed-item__source">The Line</span>
          <span class="feed-item__date">Apr 9, 2026</span>
        </div>
        <div class="feed-item__title">Ep. 5 — Andrew Esqueda: God's Words, Not Claude's</div>
      </a>
      <a class="feed-item" href="https://seanisdwelling.substack.com" target="_blank" rel="noopener">
        <div class="feed-item__meta">
          <span class="${badgeClass('essay')}">ESSAY</span>
          <span class="feed-item__source">Sean Legnini</span>
        </div>
        <div class="feed-item__title">Latest from Sean Is Dwelling →</div>
      </a>
      <a class="feed-item" href="https://matthewkr.substack.com" target="_blank" rel="noopener">
        <div class="feed-item__meta">
          <span class="${badgeClass('essay')}">ESSAY</span>
          <span class="feed-item__source">Matthew Kruger-Ross</span>
        </div>
        <div class="feed-item__title">Latest from Matthew's Substack →</div>
      </a>
      <a class="feed-item" href="https://pexelab.substack.com" target="_blank" rel="noopener">
        <div class="feed-item__meta">
          <span class="${badgeClass('roundup')}">ROUNDUP</span>
          <span class="feed-item__source">PEXE Roundup</span>
        </div>
        <div class="feed-item__title">Weekly roundup on PEXE Substack →</div>
      </a>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const desc = stripHtml(item.description);
    return `
    <a class="feed-item" href="${item.link}" target="_blank" rel="noopener">
      <div class="feed-item__meta">
        <span class="${badgeClass(item.type)}">${badgeLabel(item.type)}</span>
        <span class="feed-item__source">${item.source}</span>
        <span class="feed-item__date">${formatDate(item.date)}</span>
      </div>
      <div class="feed-item__title">${item.title}</div>
      ${desc ? `<p class="feed-item__description">${escapeHtml(desc)}</p>` : ''}
    </a>
  `;
  }).join('');
}

// Run on page load
document.addEventListener('DOMContentLoaded', loadFeeds);
