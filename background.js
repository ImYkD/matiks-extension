importScripts('matiks-client.js');

const STORE_KEYS = {
  authorizationToken: 'matiksAuthorizationToken',
  cookieHeader: 'matiksSessionCookie',
  lastRun: 'matiksLastRun'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === 'matiks.loadFriendIds') {
    handleLoadFriendIds(message, sendResponse);
    return true;
  }

  if (message.type === 'matiks.previewUnfriend') {
    handlePreviewUnfriend(message, sendResponse);
    return true;
  }

  if (message.type === 'matiks.executeUnfriend') {
    handleExecuteUnfriend(message, sendResponse);
    return true;
  }

  if (message.type === 'matiks.readToken') {
    chrome.storage.local.get([STORE_KEYS.authorizationToken], (result) => {
      sendResponse({ authorizationToken: result[STORE_KEYS.authorizationToken] || '' });
    });
    return true;
  }
});

async function handleLoadFriendIds(message, sendResponse) {
  const client = new MatiksClient();

  try {
    const token = message.authorizationToken || '';
    const queue = {
      authorizationToken: token,
      friendQuery: message.friendQuery || undefined
    };

    const records = await client.getFriendRecords(queue);
    const ids = records.map((record) => record.userId);

    chrome.storage.local.set({
      matiksLastFriendIds: ids,
      matiksLastFriendRecords: records
    });

    sendResponse({ ok: true, ids, records, count: ids.length });
  } catch (error) {
    sendResponse({ ok: false, message: error.message || String(error) });
  }
}

async function handlePreviewUnfriend(message, sendResponse) {
  const client = new MatiksClient();

  try {
    const records = await client.getFriendRecords({
      authorizationToken: message.authorizationToken || ''
    });

    const filtered = await client.resolveFilters(records, message.filters || {});

    sendResponse({ ok: true, ids: filtered, count: filtered.length });
  } catch (error) {
    sendResponse({ ok: false, message: error.message || String(error) });
  }
}

async function handleExecuteUnfriend(message, sendResponse) {
  const client = new MatiksClient();
  const ids = message.targetIds || [];
  const token = message.authorizationToken || '';
  const delay = Number(message.filters && message.filters.requestDelay) || 1500;
  const dryRun = Boolean(message.filters && message.filters.dryRun);

  const cookies = await client.getCookieHeaderFromStorage();
  const operationResults = [];

  for (const userId of ids) {
    if (dryRun) {
      operationResults.push({ userId, dryRun: true, status: 'preview' });
      continue;
    }

    try {
      await client.removeFriend(userId, {
        authorizationToken: token,
        cookieHeader: cookies
      });

      operationResults.push({ userId, dryRun: false, status: 'removed' });

      if (delay > 0) {
        await sleep(delay);
      }
    } catch (error) {
      operationResults.push({ userId, dryRun: false, status: 'error', error: error.message || String(error) });
    }
  }

  chrome.storage.local.set({ matiksLastRun: { timestamp: new Date().toISOString(), results: operationResults } });

  sendResponse({ ok: true, results: operationResults, count: operationResults.length });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
