function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function updateStatusUI(data) {
  const badge = document.getElementById('statusBadge');
  const lastSync = document.getElementById('lastSync');
  const expiresAt = document.getElementById('expiresAt');
  const errorMsg = document.getElementById('errorMsg');
  const successMsg = document.getElementById('successMsg');

  if (!badge || !lastSync || !expiresAt || !errorMsg || !successMsg) return;

  const status = data.tokenStatus || 'missing';

  badge.className = `badge badge-${status}`;

  const dot = badge.querySelector('.badge-dot');
  if (!dot) {
    badge.innerHTML = '<span class="badge-dot"></span><span id="statusText"></span>';
  }

  const labels = {
    synced: 'Sincronizado',
    missing: 'Token ausente',
    error: 'Erro',
  };
  const textEl = document.getElementById('statusText');
  if (textEl) textEl.textContent = labels[status] || status;

  lastSync.textContent = formatDate(data.lastSync);
  expiresAt.textContent = formatDate(data.expiresAt);

  if (data.lastError) {
    errorMsg.className = 'error-msg';
    errorMsg.textContent = data.lastError;
    errorMsg.style.display = 'block';
  } else {
    errorMsg.style.display = 'none';
  }

  if (status === 'synced') {
    successMsg.className = 'success-msg';
    successMsg.textContent = 'Token sincronizado com sucesso!';
    successMsg.style.display = 'block';
    setTimeout(() => { successMsg.style.display = 'none'; }, 3000);
  } else {
    successMsg.style.display = 'none';
  }
}

async function loadStatus() {
  chrome.storage.local.get(['lastSync', 'lastError', 'tokenStatus', 'expiresAt', 'dashboardUrl', 'extensionSecret'], (data) => {
    updateStatusUI(data);
    document.getElementById('dashboardUrl').value = data.dashboardUrl || 'https://dashboard-aprovacao-leticia-production.up.railway.app';
    document.getElementById('extensionSecret').value = data.extensionSecret || '';
  });
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const dashboardUrl = document.getElementById('dashboardUrl').value.trim();
  const extensionSecret = document.getElementById('extensionSecret').value.trim();
  chrome.storage.local.set({ dashboardUrl, extensionSecret }, () => {
    const btn = document.getElementById('saveBtn');
    btn.textContent = 'Salvo!';
    setTimeout(() => { btn.textContent = 'Salvar Configurações'; }, 1500);
  });
});

document.getElementById('syncBtn').addEventListener('click', () => {
  const btn = document.getElementById('syncBtn');
  btn.textContent = 'Sincronizando...';
  btn.disabled = true;

  chrome.runtime.sendMessage({ action: 'syncNow' }, (response) => {
    btn.textContent = 'Sincronizar Agora';
    btn.disabled = false;
    if (response) {
      updateStatusUI(response);
    }
  });
});

document.addEventListener('DOMContentLoaded', loadStatus);
