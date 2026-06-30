const VEXPENSES_DOMAIN = 'https://app.vexpenses.com';
const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';
const SYNC_ALARM = 'vexpenses-token-sync';

async function getDashboardUrl() {
  const { dashboardUrl } = await chrome.storage.local.get('dashboardUrl');
  return dashboardUrl || DEFAULT_DASHBOARD_URL;
}

async function getExtensionSecret() {
  const { extensionSecret } = await chrome.storage.local.get('extensionSecret');
  return extensionSecret || '';
}

async function extractAndSyncToken() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'app.vexpenses.com' });
    const laravelToken = cookies.find(c => c.name === 'laravel_token');
    const laravelSession = cookies.find(c => c.name === 'laravel_session');

    if (!laravelToken) {
      console.log('[VExpenses Sync] No laravel_token cookie found');
      await chrome.storage.local.set({
        lastSync: null,
        lastError: 'Token não encontrado. Faça login no app.vexpenses.com primeiro.',
        tokenStatus: 'missing',
      });
      return;
    }

    const dashboardUrl = await getDashboardUrl();
    const secret = await getExtensionSecret();

    const payload = {
      laravel_token: laravelToken.value,
      laravel_session: laravelSession ? laravelSession.value : null,
      expires_at: laravelToken.expirationDate || laravelSession?.expirationDate,
    };

    if (secret) {
      payload.secret = secret;
    }

    const resp = await fetch(`${dashboardUrl}/api/vexpenses/update-laravel-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('[VExpenses Sync] API error:', resp.status, errorText);
      await chrome.storage.local.set({
        lastSync: null,
        lastError: `Erro ${resp.status}: ${errorText}`,
        tokenStatus: 'error',
      });
      return;
    }

    const data = await resp.json();
    console.log('[VExpenses Sync] Token synced successfully');

    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastError: null,
      tokenStatus: 'synced',
      expiresAt: data.expires_at,
    });
  } catch (err) {
    console.error('[VExpenses Sync] Error:', err);
    await chrome.storage.local.set({
      lastSync: null,
      lastError: String(err),
      tokenStatus: 'error',
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  extractAndSyncToken();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    extractAndSyncToken();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = new URL(tab.url);
    if (url.hostname === 'app.vexpenses.com' || url.hostname === 'amp.vexpenses.com') {
      setTimeout(() => extractAndSyncToken(), 2000);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'syncNow') {
    extractAndSyncToken().then(() => {
      chrome.storage.local.get(['lastSync', 'lastError', 'tokenStatus', 'expiresAt'], (data) => {
        sendResponse(data);
      });
    });
    return true;
  }
});
