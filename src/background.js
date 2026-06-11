const ext = typeof browser !== 'undefined' ? browser : chrome;

ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.create({
    id: 'tg-download',
    title: 'Download with TweetGet',
    contexts: ['link'],
    targetUrlPatterns: ['*://twitter.com/*/status/*', '*://x.com/*/status/*']
  });
});

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tg-download') return;
  ext.tabs.sendMessage(tab.id, { type: 'TG_CONTEXT_DOWNLOAD', url: info.linkUrl });
});

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

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'TG_DOWNLOAD') return false;

  const safeFile = sanitize(msg.filename.replace('TweetGet/', ''));
  const filename  = `TweetGet/${safeFile}`;

  ext.downloads.download(
    { url: msg.url, filename, saveAs: false, conflictAction: 'uniquify' },
    (downloadId) => {
      const err = ext.runtime.lastError;
      sendResponse(err ? { error: err.message } : { downloadId });
    }
  );

  return true; // keep message channel open for async sendResponse
});
