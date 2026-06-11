const ext = typeof browser !== 'undefined' ? browser : chrome;
const API = 'https://tweetget-production.up.railway.app';
const DOWNLOAD_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

const urlInput    = document.getElementById('urlInput');
const fetchBtn    = document.getElementById('fetchBtn');
const errorBox    = document.getElementById('errorBox');
const resultCard  = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultMeta  = document.getElementById('resultMeta');
const actionRow   = document.getElementById('actionRow');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');

let currentInfo = null;

const showError  = (msg) => { errorBox.textContent = msg; errorBox.style.display = 'block'; };
const clearError = ()    => { errorBox.style.display = 'none'; };
const setProgress = (pct, label) => {
  progressBar.style.width = `${pct}%`;
  progressLabel.textContent = label;
  progressWrap.style.display = 'flex';
};
const hideProgress = () => { progressWrap.style.display = 'none'; };

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
    setProgress(10 + Math.min(i * 0.7, 75), `Processing… ${(i * 0.5).toFixed(0)}s`);
  }
  return null;
}

// Use chrome.downloads directly from popup (popup pages have full ext API access)
function downloadFile(jobId, filename, btn) {
  return new Promise((resolve, reject) => {
    const safeFile = `TweetGet/${sanitize(filename)}`;
    const url = `${API}/download/${jobId}`;

    // chrome.downloads is available in popup pages in all Chromium browsers
    // Firefox also exposes it via the chrome compatibility shim
    if (ext.downloads && ext.downloads.download) {
      ext.downloads.download(
        { url, filename: safeFile, saveAs: false, conflictAction: 'uniquify' },
        (downloadId) => {
          const err = ext.runtime.lastError;
          if (err) { reject(new Error(err.message)); return; }
          if (btn) { btn.classList.add('done'); btn.innerHTML = `${DOWNLOAD_ICON} Saved!`; }
          resolve(downloadId);
        }
      );
    } else {
      // Fallback: open directly (server sends Content-Disposition: attachment)
      window.open(url, '_blank');
      if (btn) { btn.classList.add('done'); btn.innerHTML = `${DOWNLOAD_ICON} Saved!`; }
      resolve();
    }
  });
}

async function startDownload(format, photoIndex, btn, label) {
  if (!currentInfo) return;
  btn.disabled = true;
  setProgress(5, 'Starting…');

  try {
    const body = { url: currentInfo.url, title: currentInfo.title || 'tweet', format };
    if (photoIndex !== null && photoIndex !== undefined) body.photo_index = photoIndex;

    const start = await apiPost('/start', body);
    if (start.error) throw new Error(start.error);

    setProgress(10, 'Processing…');
    const result = await pollStatus(start.job_id);
    if (!result) throw new Error('Processing failed');

    setProgress(90, 'Downloading…');
    await downloadFile(start.job_id, result.filename, btn);
    setProgress(100, 'Done!');
    setTimeout(hideProgress, 2000);
  } catch (err) {
    hideProgress();
    showError(err.message);
    btn.disabled = false;
    btn.classList.add('error');
    btn.textContent = '✕ Error';
  }
}

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) { showError('Paste a Twitter/X URL first.'); return; }

  clearError();
  resultCard.style.display = 'none';
  hideProgress();
  actionRow.innerHTML = '';
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<span class="spinner"></span> Fetching…';

  try {
    const data = await apiPost('/info', { url });
    if (data.error) throw new Error(data.error);

    currentInfo = data;
    resultTitle.textContent = data.title || 'Twitter Media';

    resultMeta.innerHTML = '';
    if (data.uploader) resultMeta.innerHTML += `<span class="meta-chip">@${data.uploader}</span>`;
    if (data.duration && data.duration !== '—') resultMeta.innerHTML += `<span class="meta-chip">⏱ ${data.duration}</span>`;
    if (data.is_video) resultMeta.innerHTML += `<span class="meta-chip">🎬 Video</span>`;
    if (data.photo_count) resultMeta.innerHTML += `<span class="meta-chip">🖼 ${data.photo_count} image${data.photo_count > 1 ? 's' : ''}</span>`;

    if (data.is_video) {
      const btn = document.createElement('button');
      btn.className = 'dl-btn';
      btn.innerHTML = `${DOWNLOAD_ICON} Download Video`;
      btn.addEventListener('click', () => startDownload('mp4', null, btn, 'Video'));
      actionRow.appendChild(btn);
    }

    if (data.photo_count > 0) {
      const count = data.photo_count;
      if (count === 1) {
        const btn = document.createElement('button');
        btn.className = 'dl-btn';
        btn.innerHTML = `${DOWNLOAD_ICON} Download Image`;
        btn.addEventListener('click', () => startDownload('jpg', 0, btn, 'Image'));
        actionRow.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'dl-btn';
        btn.innerHTML = `${DOWNLOAD_ICON} All ${count} Images`;
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          setProgress(5, `Preparing ${count} images…`);
          try {
            const jobs = await Promise.all(
              Array.from({ length: count }, (_, i) =>
                apiPost('/start', { url: currentInfo.url, title: currentInfo.title || 'tweet', format: 'jpg', photo_index: i })
              )
            );
            let done = 0;
            await Promise.all(jobs.map(async (j) => {
              if (j.error) return;
              const res = await pollStatus(j.job_id);
              if (!res) return;
              await downloadFile(j.job_id, res.filename, null);
              done++;
              setProgress(20 + (done / count) * 70, `Saved ${done}/${count}…`);
            }));
            setProgress(100, `Done! ${done} images saved.`);
            btn.classList.add('done');
            btn.innerHTML = `${DOWNLOAD_ICON} Saved ${done}!`;
            setTimeout(hideProgress, 2000);
          } catch (err) {
            hideProgress();
            showError(err.message);
            btn.disabled = false;
          }
        });
        actionRow.appendChild(btn);
      }
    }

    resultCard.style.display = 'flex';
  } catch (err) {
    showError(err.message);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Get Tweet';
  }
}

fetchBtn.addEventListener('click', fetchInfo);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchInfo(); });

ext.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url && /twitter\.com|x\.com/.test(tab.url) && tab.url.includes('/status/')) {
    urlInput.value = tab.url.split('?')[0];
  }
});
