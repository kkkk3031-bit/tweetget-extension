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
  return (name || 'download')
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'download';
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
