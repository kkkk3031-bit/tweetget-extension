// Cross-browser shim: Firefox exposes `browser`, Chrome exposes `chrome`
const ext = typeof browser !== 'undefined' ? browser : chrome;

const API = 'https://tweetget-production.up.railway.app';

const DOWNLOAD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function getTweetUrl(article) {
  const link = article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const href = link.getAttribute('href');
  if (!href.match(/\/status\/\d+/)) return null;
  return `https://x.com${href.split('?')[0]}`;
}

function hasMedia(article) {
  return (
    article.querySelector('[data-testid="videoPlayer"]') !== null ||
    article.querySelector('[data-testid="tweetPhoto"]') !== null ||
    article.querySelector('video') !== null
  );
}

function alreadyInjected(article) {
  return article.querySelector('.tg-wrap') !== null;
}

async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function pollStatus(jobId) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 500));
    const r = await fetch(`${API}/status/${jobId}`);
    const d = await r.json();
    if (d.status === 'done') return d;
    if (d.status === 'error') return null;
  }
  return null;
}

function sanitize(name) {
  // Keep Unicode (Arabic etc); strip only Windows/Chrome-forbidden characters.
  let s = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const i = s.lastIndexOf('.');
  const hasExt = i >= 0 && s.length - i <= 6;
  let stem = (hasExt ? s.slice(0, i) : s).replace(/^[. ]+|[. ]+$/g, '');
  const ext = hasExt ? s.slice(i) : '';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem = '_' + stem;
  if (!stem) stem = 'download';
  return stem.slice(0, 150) + ext;
}

// Send download request to background; fallback to iframe if SW is unreachable
function triggerDownload(jobId, filename) {
  const url = `${API}/download/${jobId}`;
  const safeFile = `TweetGet/${sanitize(filename)}`;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };

    // Primary: message background service worker
    try {
      ext.runtime.sendMessage(
        { type: 'TG_DOWNLOAD', url, filename: safeFile },
        (res) => {
          if (ext.runtime.lastError) {
            // SW unreachable — fall through to iframe fallback
            iframeFallback(url);
          }
          done();
        }
      );
    } catch (_) {
      iframeFallback(url);
      done();
    }

    // Safety timeout: if no response in 4 s, use iframe fallback
    setTimeout(() => {
      if (!settled) {
        iframeFallback(url);
        done();
      }
    }, 4000);
  });
}

function iframeFallback(url) {
  // Content-Disposition: attachment on the server means browser downloads it
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', '');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 2000);
}

async function handleDownload(tweetUrl, format, photoIndex, btn, label) {
  btn.disabled = true;
  btn.classList.add('tg-loading');
  btn.innerHTML = `<span class="tg-spinner"></span>${label}ing…`;

  try {
    const info = await apiPost('/info', { url: tweetUrl });
    if (info.error) throw new Error(info.error);

    const body = { url: info.url, title: info.title || 'tweet', format };
    if (photoIndex !== null && photoIndex !== undefined) body.photo_index = photoIndex;
    const startData = await apiPost('/start', body);
    if (startData.error) throw new Error(startData.error);

    const result = await pollStatus(startData.job_id);
    if (!result) throw new Error('Processing failed');

    await triggerDownload(startData.job_id, result.filename);

    btn.classList.remove('tg-loading');
    btn.classList.add('tg-done');
    btn.innerHTML = `${DOWNLOAD_ICON} Saved!`;
    setTimeout(() => {
      btn.classList.remove('tg-done');
      btn.disabled = false;
      btn.innerHTML = `${DOWNLOAD_ICON} ${label}`;
    }, 3000);
  } catch (err) {
    btn.classList.remove('tg-loading');
    btn.classList.add('tg-error');
    btn.innerHTML = `✕ ${err.message.slice(0, 28)}`;
    btn.disabled = false;
    setTimeout(() => {
      btn.classList.remove('tg-error');
      btn.innerHTML = `${DOWNLOAD_ICON} ${label}`;
    }, 4000);
  }
}

async function injectButtons(article) {
  if (alreadyInjected(article)) return;
  if (!hasMedia(article)) return;

  const tweetUrl = getTweetUrl(article);
  if (!tweetUrl) return;

  const wrap = document.createElement('div');
  wrap.className = 'tg-wrap';

  const isVideo = article.querySelector('[data-testid="videoPlayer"], video') !== null;
  const isPhoto = article.querySelector('[data-testid="tweetPhoto"]') !== null;

  if (isVideo) {
    const btn = document.createElement('button');
    btn.className = 'tg-btn';
    btn.innerHTML = `${DOWNLOAD_ICON} Video`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDownload(tweetUrl, 'mp4', null, btn, 'Video');
    });
    wrap.appendChild(btn);
  }

  if (isPhoto) {
    const photos = article.querySelectorAll('[data-testid="tweetPhoto"]');
    if (photos.length === 1) {
      const btn = document.createElement('button');
      btn.className = 'tg-btn';
      btn.innerHTML = `${DOWNLOAD_ICON} Image`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDownload(tweetUrl, 'jpg', 0, btn, 'Image');
      });
      wrap.appendChild(btn);
    } else if (photos.length > 1) {
      const btn = document.createElement('button');
      btn.className = 'tg-btn';
      btn.innerHTML = `${DOWNLOAD_ICON} All (${photos.length})`;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.classList.add('tg-loading');
        btn.innerHTML = `<span class="tg-spinner"></span>Loading…`;
        try {
          const info = await apiPost('/info', { url: tweetUrl });
          if (info.error) throw new Error(info.error);
          const count = info.photo_count || photos.length;
          const jobs = await Promise.all(
            Array.from({ length: count }, (_, idx) =>
              apiPost('/start', { url: info.url, title: info.title || 'tweet', format: 'jpg', photo_index: idx })
            )
          );
          let done = 0;
          await Promise.all(jobs.map(async (j) => {
            if (j.error) return;
            const res = await pollStatus(j.job_id);
            if (!res) return;
            await triggerDownload(j.job_id, res.filename);
            done++;
            btn.innerHTML = `<span class="tg-spinner"></span>${done}/${count}`;
          }));
          btn.classList.remove('tg-loading');
          btn.classList.add('tg-done');
          btn.innerHTML = `${DOWNLOAD_ICON} Saved ${done}!`;
          setTimeout(() => {
            btn.classList.remove('tg-done');
            btn.disabled = false;
            btn.innerHTML = `${DOWNLOAD_ICON} All (${count})`;
          }, 3000);
        } catch (err) {
          btn.classList.remove('tg-loading');
          btn.classList.add('tg-error');
          btn.innerHTML = `✕ Failed`;
          btn.disabled = false;
          setTimeout(() => {
            btn.classList.remove('tg-error');
            btn.innerHTML = `${DOWNLOAD_ICON} All Images`;
          }, 3000);
        }
      });
      wrap.appendChild(btn);
    }
  }

  if (wrap.children.length === 0) return;

  // Try multiple insertion points — Twitter's DOM varies by tweet type
  const actionBar  = article.querySelector('[role="group"]');
  const mediaBlock = article.querySelector('[data-testid="videoPlayer"], [data-testid="tweetPhoto"]');

  if (actionBar) {
    // Insert right after the action bar (reply/retweet/like row), inside the tweet
    actionBar.insertAdjacentElement('afterend', wrap);
  } else if (mediaBlock) {
    mediaBlock.closest('div')?.insertAdjacentElement('afterend', wrap) ?? article.appendChild(wrap);
  } else {
    article.appendChild(wrap);
  }
}

// Multiple selectors to handle different Twitter/X page layouts
const TWEET_SELECTORS = [
  'article[data-testid="tweet"]',
  'article[data-testid="tweetDetail"]',
  'div[data-testid="tweet"]'
];

function scanArticles() {
  TWEET_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(article => {
      if (alreadyInjected(article)) return;
      if (hasMedia(article)) {
        injectButtons(article);
      } else {
        // Retry — media may not be in DOM yet
        setTimeout(() => {
          if (!alreadyInjected(article) && hasMedia(article)) injectButtons(article);
        }, 1200);
      }
    });
  });
}

// MutationObserver for new tweets as you scroll
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scanArticles, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

// Interval fallback — catches tweets missed by observer (SPA navigation)
setInterval(scanArticles, 2000);

// Initial run
scanArticles();
