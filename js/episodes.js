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

async function loadAllEpisodes() {
  const container = document.querySelector('.episode-list');
  if (!container) return;

  try {
    const url = `https://itunes.apple.com/lookup?id=${PODCAST_ID}&media=podcast&entity=podcastEpisode&limit=50`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const episodes = data.results
      .filter(r => r.wrapperType === 'podcastEpisode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    if (episodes.length === 0) return;

    const total = episodes.length;
    container.innerHTML = episodes.map((ep, i) => {
      const num = total - i;
      const date = formatEpisodeDate(new Date(ep.releaseDate));
      const desc = stripHtml(ep.description || ep.shortDescription || '').trim();
      return `
        <div class="episode-item">
          <p class="episode-item__number">Episode ${num}</p>
          <a href="${ep.trackViewUrl}" class="episode-item__title" target="_blank" rel="noopener">${ep.trackName}</a>
          <p class="episode-item__date">${date}</p>
          ${desc ? `<p class="episode-item__description">${desc}</p>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Failed to load episodes:', err);
  }
}

document.addEventListener('DOMContentLoaded', loadAllEpisodes);
