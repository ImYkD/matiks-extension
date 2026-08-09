const elements = {
  tokenInput: document.getElementById('authorization-token'),
  maxFriends: document.getElementById('max-friends'),
  requestDelay: document.getElementById('request-delay'),
  inactiveDays: document.getElementById('inactive-days'),
  includeIds: document.getElementById('include-ids'),
  excludeIds: document.getElementById('exclude-ids'),
  dryRun: document.getElementById('dry-run'),
  reverseFilter: document.getElementById('reverse-filter'),
  status: document.getElementById('connection-status'),
  log: document.getElementById('status-log'),
  friendList: document.getElementById('friend-list')
};

const service = {
  preview: document.getElementById('preview-unfriend'),
  load: document.getElementById('load-friends'),
  run: document.getElementById('run-unfriend')
};

function updateLog(message) {
  elements.log.textContent = message;
}

function renderFriendList(records) {
  if (!Array.isArray(records) || records.length === 0) {
    elements.friendList.innerHTML = '<span class="empty-state">No friend list loaded</span>';
    return;
  }

  const rows = records.map((record) => {
    const userId = record.userId || record._id || '';
    const lastPlayed = record.lastPlayedDate || '—';
    return `<div class="friend-list-row">
      <span class="friend-user-id">${userId}</span>
      <span class="friend-last-played">${lastPlayed}</span>
    </div>`;
  }).join('');

  elements.friendList.innerHTML = rows;
}

function getSettings() {
  return {
    authorizationToken: elements.tokenInput.value.trim(),
    maxFriends: Number(elements.maxFriends.value) || 0,
    requestDelay: Number(elements.requestDelay.value) || 1500,
    inactiveDays: Number(elements.inactiveDays.value) || 30,
    includeIds: elements.includeIds.value,
    excludeIds: elements.excludeIds.value,
    dryRun: elements.dryRun.checked,
    reverseFilter: elements.reverseFilter.checked
  };
}

function persistSettings(settings) {
  chrome.storage.local.set({
    matiksAuthorizationToken: settings.authorizationToken,
    matiksSettings: settings
  });
}

function restoreSettings() {
  chrome.storage.local.get(['matiksAuthorizationToken', 'matiksSettings'], (result) => {
    const settings = result.matiksSettings || {};

    if (result.matiksAuthorizationToken) {
      elements.tokenInput.value = result.matiksAuthorizationToken;
    }

    if (settings.maxFriends) {
      elements.maxFriends.value = settings.maxFriends;
    }

    if (settings.requestDelay) {
      elements.requestDelay.value = settings.requestDelay;
    }

    if (settings.inactiveDays) {
      elements.inactiveDays.value = settings.inactiveDays;
    }

    if (settings.includeIds) {
      elements.includeIds.value = settings.includeIds;
    }

    if (settings.excludeIds) {
      elements.excludeIds.value = settings.excludeIds;
    }

    if (typeof settings.dryRun !== 'undefined') {
      elements.dryRun.checked = settings.dryRun;
    }

    if (typeof settings.reverseFilter !== 'undefined') {
      elements.reverseFilter.checked = settings.reverseFilter;
    }
  });
}

service.load.addEventListener('click', async () => {
  const settings = getSettings();
  persistSettings(settings);

  updateLog('Loading friend IDs...');

  chrome.runtime.sendMessage({
    type: 'matiks.loadFriendIds',
    authorizationToken: settings.authorizationToken
  }, (response) => {
    if (chrome.runtime.lastError) {
      updateLog(chrome.runtime.lastError.message);
      return;
    }

    if (response && response.ok) {
      updateLog(`Loaded ${response.count} friend IDs`);
      elements.status.textContent = 'Online';
      elements.status.classList.add('online');
      renderFriendList(response.records || []);
    } else {
      updateLog(response && response.message ? response.message : 'Could not load friends');
    }
  });
});

service.preview.addEventListener('click', async () => {
  const settings = getSettings();
  persistSettings(settings);

  updateLog('Previewing filter target list...');

  chrome.runtime.sendMessage({
    type: 'matiks.previewUnfriend',
    authorizationToken: settings.authorizationToken,
    filters: {
      includeIds: settings.includeIds,
      excludeIds: settings.excludeIds,
      maxFriends: settings.maxFriends,
      reverseFilter: settings.reverseFilter,
      requestDelay: settings.requestDelay,
      dryRun: settings.dryRun,
      inactiveDays: settings.inactiveDays
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      updateLog(chrome.runtime.lastError.message);
      return;
    }

    if (response && response.ok) {
      updateLog(`Preview: ${response.count} matched friends`);
    } else {
      updateLog(response && response.message ? response.message : 'Preview failed');
    }
  });
});

service.run.addEventListener('click', async () => {
  const settings = getSettings();
  persistSettings(settings);

  updateLog('Starting unfriend operation...');

  chrome.runtime.sendMessage({
    type: 'matiks.previewUnfriend',
    authorizationToken: settings.authorizationToken,
    filters: {
      includeIds: settings.includeIds,
      excludeIds: settings.excludeIds,
      maxFriends: settings.maxFriends,
      reverseFilter: settings.reverseFilter,
      requestDelay: settings.requestDelay,
      dryRun: settings.dryRun,
      inactiveDays: settings.inactiveDays
    }
  }, (previewResponse) => {
    if (chrome.runtime.lastError) {
      updateLog(chrome.runtime.lastError.message);
      return;
    }

    if (!(previewResponse && previewResponse.ok)) {
      updateLog(previewResponse && previewResponse.message ? previewResponse.message : 'Could not resolve targets');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'matiks.executeUnfriend',
      authorizationToken: settings.authorizationToken,
      targetIds: previewResponse.ids,
      filters: {
        requestDelay: settings.requestDelay,
        dryRun: settings.dryRun
      }
    }, (executeResponse) => {
      if (chrome.runtime.lastError) {
        updateLog(chrome.runtime.lastError.message);
        return;
      }

      if (executeResponse && executeResponse.ok) {
        const successful = (executeResponse.results || []).filter((item) => item.status === 'removed').length;
        const dry = (executeResponse.results || []).filter((item) => item.status === 'preview').length;

        updateLog(`Completed. Removed ${successful}. Dry-run ${dry}.`);
      } else {
        updateLog(executeResponse && executeResponse.message ? executeResponse.message : 'Execution failed');
      }
    });
  });
});

restoreSettings();
