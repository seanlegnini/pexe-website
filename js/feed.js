// ========================================
// PEXE Lab — Feed Aggregator
// Substack JSON API only — podcast episodes arrive
// as "The Line Ep. …" cross-posts and are re-badged
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

// Netlify Function as primary proxy (reliable, whitelisted to feed hosts).
// Public proxies are fallbacks for local dev and for belt-and-suspenders.
const CORS_PROXIES = [
  url => `/api/proxy?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

const CACHE_KEY = 'pexe_feed_cache_v4';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Helper: race all CORS proxies in parallel, first success wins
async function proxyFetch(url, timeoutMs = 4000) {
  const attempts = CORS_PROXIES.map(wrap => (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(wrap(url), { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  })());
  return await Promise.any(attempts);
}

// Fetch Substack posts via JSON API through CORS proxy
async function fetchSubstack(feed) {
  try {
    const url = `https://${feed.subdomain}.substack.com/api/v1/posts?limit=5`;
    const raw = await proxyFetch(url);
    const posts = JSON.parse(raw);
    return posts.map(post => {
      const isEpisode = /^the line ep/i.test(post.title || '');
      return {
        title: post.title,
        link: post.canonical_url || `https://${feed.subdomain}.substack.com/p/${post.slug}`,
        date: new Date(post.post_date),
        source: isEpisode ? 'The Line' : feed.source,
        type: isEpisode ? 'podcast' : feed.type,
        description: post.subtitle || post.description || post.truncated_body_text || '',
        image: post.cover_image || ''
      };
    });
  } catch (err) {
    console.warn(`Failed to fetch ${feed.source}:`, err);
    return [];
  }
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function badgeClass(type) {
  return `feed-card__badge feed-card__badge--${type}`;
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

function getCachedFeed(opts = {}) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!opts.allowStale && Date.now() - cached.ts > CACHE_TTL) return null;
    cached.items.forEach(item => { item.date = new Date(item.date); });
    return cached.items;
  } catch { return null; }
}

function setCachedFeed(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* storage full — ignore */ }
}

// Collapse cross-posts (same piece published on multiple Substacks)
function dedupeItems(items) {
  const seen = new Map();
  items.forEach(item => {
    const key = (item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const kept = seen.get(key);
    if (!kept) {
      seen.set(key, item);
    } else if (!kept.image && item.image) {
      seen.set(key, item);
    }
  });
  return [...seen.values()];
}

async function fetchAllFeeds() {
  const allItems = [];
  const results = await Promise.allSettled(
    SUBSTACK_FEEDS.map(f => fetchSubstack(f))
  );
  results.forEach(r => {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  });
  const deduped = dedupeItems(allItems);
  deduped.sort((a, b) => b.date - a.date);
  return deduped.slice(0, 8);
}

async function loadFeeds() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  // Show fresh cache immediately if available, then refresh in background
  const fresh = getCachedFeed();
  if (fresh && fresh.length > 0) {
    renderFeed(container, fresh);
    fetchAllFeeds().then(items => {
      if (items.length > 0) {
        setCachedFeed(items);
        renderFeed(container, items);
      }
    });
    return;
  }

  // Show stale cache (if any) while fetching — beats a loading spinner
  const stale = getCachedFeed({ allowStale: true });
  if (stale && stale.length > 0) {
    renderFeed(container, stale);
  } else {
    container.innerHTML = '<p class="feed-loading">Loading latest from PEXE…</p>';
  }

  const display = await fetchAllFeeds();
  if (display.length > 0) {
    setCachedFeed(display);
    renderFeed(container, display);
  } else if (!stale || stale.length === 0) {
    // Nothing stale, nothing fetched — render the hardcoded fallback
    renderFeed(container, []);
  }
}

const FALLBACK_ITEMS = [
  {
    title: "Ep. 5 — Andrew Esqueda: God's Words, Not Claude's",
    link: 'https://podcasts.apple.com/us/podcast/the-line/id1876957994?i=1000760455039',
    date: new Date(2026, 3, 9),
    source: 'The Line',
    type: 'podcast',
    description: '',
    image: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/1c/12/50/1c1250fe-d1c6-de68-4798-7e1f8688beef/mza_9162185161222932839.jpg/600x600bb.jpg'
  },
  {
    title: 'Latest from Sean Is Dwelling →',
    link: 'https://seanisdwelling.substack.com',
    date: null,
    source: 'Sean Legnini',
    type: 'essay',
    description: '',
    image: ''
  },
  {
    title: "Latest from Matthew's Substack →",
    link: 'https://matthewkr.substack.com',
    date: null,
    source: 'Matthew Kruger-Ross',
    type: 'essay',
    description: '',
    image: ''
  },
  {
    title: 'Weekly roundup on PEXE Substack →',
    link: 'https://pexelab.substack.com',
    date: null,
    source: 'PEXE Roundup',
    type: 'roundup',
    description: '',
    image: ''
  }
];

function cardHtml(item) {
  const desc = stripHtml(item.description);
  const media = item.image
    ? `<div class="feed-card__media"><img src="${escapeHtml(item.image)}" alt="" loading="lazy"></div>`
    : `<div class="feed-card__media feed-card__media--placeholder feed-card__media--${item.type}"><span>${escapeHtml(item.source)}</span></div>`;
  return `
    <a class="feed-card" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">
      ${media}
      <div class="feed-card__body">
        <div class="feed-card__meta">
          <span class="${badgeClass(item.type)}">${badgeLabel(item.type)}</span>
          ${item.date ? `<span class="feed-card__date">${formatDate(item.date)}</span>` : ''}
        </div>
        <div class="feed-card__title">${escapeHtml(item.title)}</div>
        ${desc ? `<p class="feed-card__description">${escapeHtml(desc)}</p>` : ''}
        <div class="feed-card__source">${escapeHtml(item.source)}</div>
      </div>
    </a>`;
}

function renderFeed(container, items) {
  const list = items.length > 0 ? items : FALLBACK_ITEMS;
  container.innerHTML = `
    <div class="feed-carousel">
      <div class="feed-carousel__track">
        ${list.map(cardHtml).join('')}
      </div>
    </div>`;
  const track = container.querySelector('.feed-carousel__track');
  track.addEventListener('scroll', updateFeedNav, { passive: true });
  updateFeedNav();
}

function updateFeedNav() {
  const nav = document.getElementById('feed-nav');
  const track = document.querySelector('.feed-carousel__track');
  if (!nav || !track) return;
  nav.hidden = track.scrollWidth <= track.clientWidth + 4;
  const prev = nav.querySelector('[data-dir="prev"]');
  const next = nav.querySelector('[data-dir="next"]');
  if (prev) prev.disabled = track.scrollLeft <= 4;
  if (next) next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
}

function setupFeedNav() {
  const nav = document.getElementById('feed-nav');
  if (!nav) return;
  nav.addEventListener('click', e => {
    const btn = e.target.closest('button[data-dir]');
    if (!btn) return;
    const track = document.querySelector('.feed-carousel__track');
    if (!track) return;
    const card = track.querySelector('.feed-card');
    const gap = parseFloat(getComputedStyle(track).columnGap) || 18;
    const step = card ? card.offsetWidth + gap : 320;
    track.scrollBy({ left: btn.dataset.dir === 'next' ? step : -step, behavior: 'smooth' });
  });
  window.addEventListener('resize', updateFeedNav);
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
  setupFeedNav();
  loadFeeds();
});
