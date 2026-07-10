const VEXPENSES_DOMAIN = 'https://app.vexpenses.com';
const DEFAULT_DASHBOARD_URL = 'https://dashboard-aprovacao-leticia-production.up.railway.app';
const SYNC_ALARM = 'vexpenses-token-sync';

async function getDashboardUrl() {
  const { dashboardUrl } = await chrome.storage.local.get('dashboardUrl');
  // Migrate old localhost default to production URL
  if (!dashboardUrl || dashboardUrl === 'http://localhost:3000') {
    return DEFAULT_DASHBOARD_URL;
  }
  return dashboardUrl;
}

async function getExtensionSecret() {
  const { extensionSecret } = await chrome.storage.local.get('extensionSecret');
  return extensionSecret || '';
}

async function extractAndSyncToken() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'vexpenses.com' });
    const laravelToken = cookies.find(c => c.name === 'laravel_token');
    const laravelSession = cookies.find(c => c.name === 'laravel_session');
    const xsrfToken = cookies.find(c => c.name === 'XSRF-TOKEN');

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
      xsrf_token: xsrfToken ? xsrfToken.value : null,
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
      const errorText = await resp.text().catch(() => 'Unknown error');
      console.error('[VExpenses Sync] API error:', resp.status, errorText.slice(0, 200));
      await chrome.storage.local.set({
        lastSync: null,
        lastError: `Erro ${resp.status}: ${errorText.slice(0, 200)}`,
        tokenStatus: 'error',
      });
      return;
    }

    let data;
    try {
      data = await resp.json();
    } catch {
      console.error('[VExpenses Sync] Invalid JSON response');
      await chrome.storage.local.set({
        lastSync: null,
        lastError: 'Resposta inválida do servidor (não é JSON)',
        tokenStatus: 'error',
      });
      return;
    }
    console.log('[VExpenses Sync] Token synced successfully');

    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastError: null,
      tokenStatus: 'synced',
      expiresAt: data.expires_at,
    });
  } catch (err) {
    console.error('[VExpenses Sync] Error:', err);
    const errMsg = err instanceof TypeError && err.message.includes('Failed to fetch')
      ? 'Falha ao conectar. Verifique se a URL do dashboard está corta e o servidor está online.'
      : String(err);
    await chrome.storage.local.set({
      lastSync: null,
      lastError: errMsg,
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
