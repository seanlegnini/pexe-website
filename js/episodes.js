// ========================================
// PEXE Lab — The Line episode loader
// Fetches full episode list from Apple iTunes Lookup API
// ========================================

const PODCAST_ID = '1876957994';

function formatEpisodeDate(date) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

const EPISODE_PROXIES = [
  url => url, // try direct first — iTunes Lookup has CORS
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

async function raceFetch(url, timeoutMs = 5000) {
  const attempts = EPISODE_PROXIES.map(wrap => (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(wrap(url), { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  })());
  return await Promise.any(attempts);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadAllEpisodes() {
  const container = document.querySelector('.episode-list');
  if (!container) return;

  try {
    const url = `https://itunes.apple.com/lookup?id=${PODCAST_ID}&media=podcast&entity=podcastEpisode&limit=50`;
    const data = await raceFetch(url);
    const episodes = (data?.results || [])
      .filter(r => r.wrapperType === 'podcastEpisode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    if (episodes.length === 0) {
      console.warn('No episodes returned from Apple API');
      return;
    }

    const total = episodes.length;
    container.innerHTML = episodes.map((ep, i) => {
      const num = total - i;
      const date = formatEpisodeDate(new Date(ep.releaseDate));
      const desc = stripHtml(ep.description || ep.shortDescription || '').trim();
      return `
        <div class="episode-item">
          <p class="episode-item__number">Episode ${num}</p>
          <a href="${ep.trackViewUrl}" class="episode-item__title" target="_blank" rel="noopener">${escapeHtml(ep.trackName)}</a>
          <p class="episode-item__date">${date}</p>
          ${desc ? `<p class="episode-item__description">${escapeHtml(desc)}</p>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Failed to load episodes from Apple API; leaving hardcoded list:', err);
  }
}

document.addEventListener('DOMContentLoaded', loadAllEpisodes);
