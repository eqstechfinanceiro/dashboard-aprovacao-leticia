// ===== ADMIN MODULE =====
// Load ApiClient from shared module (must be loaded before this script)
// ApiClient is available globally from api-client.js

// ===== ADMIN DATA STORE =====
const AdminData = {
    sectors: [],
    automations: [],
    timeline: [],
    kpis: [],
    chartData: [],
    notes: [],
    editingItem: null
};

// ===== LOAD ADMIN DATA =====
async function loadAdminData() {
    try {
        const [sectors, automations, timeline, kpis, chartData, notes] = await Promise.all([
            window.ApiClient.getSectors(),
            window.ApiClient.getAutomations(),
            window.ApiClient.getTimeline(),
            window.ApiClient.getKPIs(),
            window.ApiClient.getChartData(),
            window.ApiClient.getNotes()
        ]);

        if (sectors) AdminData.sectors = sectors;
        if (automations) AdminData.automations = automations;
        if (timeline) AdminData.timeline = timeline;
        if (kpis) AdminData.kpis = kpis;
        if (chartData) AdminData.chartData = chartData;
        if (notes) AdminData.notes = notes;

        return true;
    } catch (error) {
        console.error('Error loading admin data:', error);
        return false;
    }
}

// ===== SECTORS =====
function renderSectorsTable() {
    const tbody = document.getElementById('sectors-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.sectors.map(sector => `
        <tr>
            <td>${sector.key}</td>
            <td>${sector.name}</td>
            <td><span class="color-preview" style="background: ${sector.color};"></span></td>
            <td>${sector.icon}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editSector('${sector.key}')">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteSector('${sector.key}')">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populateSectorSelect() {
    const selects = document.querySelectorAll('#automation-sector, #timeline-sector, #note-sector');
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um setor</option>' +
            AdminData.sectors.map(sector => `
                <option value="${sector.key}">${sector.name}</option>
            `).join('');
    });
}

async function saveSector() {
    const key = document.getElementById('sector-key').value;
    const name = document.getElementById('sector-name').value;
    const color = document.getElementById('sector-color').value;
    const icon = document.getElementById('sector-icon').value;

    if (!key || !name) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const data = { key, name, color, icon };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'sector') {
        result = await window.ApiClient.updateSector(AdminData.editingItem.key, data);
    } else {
        result = await window.ApiClient.createSector(data);
    }

    if (result) {
        await loadAdminData();
        renderSectorsTable();
        populateSectorSelect();
        hideSectorForm();
        showNotification('Setor salvo com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar setor', 'error');
    }
}

async function editSector(key) {
    const sector = AdminData.sectors.find(s => s.key === key);
    if (!sector) return;

    AdminData.editingItem = { type: 'sector', key };

    document.getElementById('sector-key').value = sector.key;
    document.getElementById('sector-key').disabled = true;
    document.getElementById('sector-name').value = sector.name;
    document.getElementById('sector-color').value = sector.color;
    document.getElementById('sector-icon').value = sector.icon;

    // Update icon selector visual selection
    const iconSelector = document.getElementById('icon-selector');
    if (iconSelector) {
        const iconOptions = iconSelector.querySelectorAll('.icon-option');
        iconOptions.forEach(opt => {
            opt.classList.remove('selected');
            if (opt.dataset.icon === sector.icon) {
                opt.classList.add('selected');
            }
        });
    }

    document.querySelector('#sector-form .admin-form-title').textContent = 'Editar Setor';
    showSectorForm();
}

async function deleteSector(key) {
    if (!confirm('Tem certeza que deseja excluir este setor?')) return;

    const result = await window.ApiClient.deleteSector(key);
    if (result) {
        await loadAdminData();
        renderSectorsTable();
        populateSectorSelect();
        showNotification('Setor excluído com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir setor', 'error');
    }
}

// ===== AUTOMATIONS =====
function renderAutomationsTable() {
    const tbody = document.getElementById('automations-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.automations.map(automation => {
        const sector = AdminData.sectors.find(s => s.key === automation.sectorKey);
        const statusClass = automation.status === 'active' ? 'active' : 
                            automation.status === 'development' ? 'paused' : 'inactive';
        const statusText = automation.status === 'active' ? 'Ativo' : 
                          automation.status === 'development' ? 'Em Desenvolvimento' : 'Planejado';
        
        return `
        <tr>
            <td>${automation.name}</td>
            <td>${sector ? sector.name : automation.sectorKey}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${automation.runtime}</td>
            <td>${automation.running ? 'Sim' : 'Não'}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editAutomation(${automation.id})">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteAutomation(${automation.id})">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

async function saveAutomation() {
    const name = document.getElementById('automation-name').value;
    const description = document.getElementById('automation-description').value;
    const sectorKey = document.getElementById('automation-sector').value;
    const status = document.getElementById('automation-status').value;
    const runtime = document.getElementById('automation-runtime').value;
    const running = document.getElementById('automation-running').value === 'true';

    if (!name || !sectorKey) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const data = { name, description, sectorKey, status, runtime, running };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'automation') {
        result = await window.ApiClient.updateAutomation(AdminData.editingItem.id, data);
    } else {
        result = await window.ApiClient.createAutomation(data);
    }

    if (result) {
        await loadAdminData();
        renderAutomationsTable();
        hideAutomationForm();
        showNotification('Automação salva com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar automação', 'error');
    }
}

async function editAutomation(id) {
    const automation = AdminData.automations.find(a => a.id === id);
    if (!automation) return;

    AdminData.editingItem = { type: 'automation', id };
    
    document.getElementById('automation-name').value = automation.name;
    document.getElementById('automation-description').value = automation.description || '';
    document.getElementById('automation-sector').value = automation.sectorKey;
    document.getElementById('automation-status').value = automation.status;
    document.getElementById('automation-runtime').value = automation.runtime;
    document.getElementById('automation-running').value = automation.running ? 'true' : 'false';
    
    document.querySelector('#automation-form .admin-form-title').textContent = 'Editar Automação';
    showAutomationForm();
}

async function deleteAutomation(id) {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return;

    const result = await window.ApiClient.deleteAutomation(id);
    if (result) {
        await loadAdminData();
        renderAutomationsTable();
        showNotification('Automação excluída com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir automação', 'error');
    }
}

// ===== TIMELINE =====
function renderTimelineTable() {
    const tbody = document.getElementById('timeline-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.timeline.map(item => `
        <tr>
            <td>${item.title}</td>
            <td><span class="status-badge active">${item.type}</span></td>
            <td>${item.date}</td>
            <td>${item.sector}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editTimeline(${item.id})">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteTimeline(${item.id})">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function saveTimeline() {
    const title = document.getElementById('timeline-title').value;
    const description = document.getElementById('timeline-description').value;
    const type = document.getElementById('timeline-type').value;
    const date = document.getElementById('timeline-date').value;
    const sectorKey = document.getElementById('timeline-sector').value;

    if (!title || !date || !sectorKey) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const sector = AdminData.sectors.find(s => s.key === sectorKey);
    const data = { 
        title, 
        description, 
        type, 
        date, 
        sectorKey, 
        sector: sector ? sector.name : sectorKey 
    };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'timeline') {
        result = await window.ApiClient.updateTimeline(AdminData.editingItem.id, data);
    } else {
        result = await window.ApiClient.createTimeline(data);
    }

    if (result) {
        await loadAdminData();
        renderTimelineTable();
        hideTimelineForm();
        showNotification('Evento de timeline salvo com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar evento', 'error');
    }
}

async function editTimeline(id) {
    const item = AdminData.timeline.find(t => t.id === id);
    if (!item) return;

    AdminData.editingItem = { type: 'timeline', id };
    
    document.getElementById('timeline-title').value = item.title;
    document.getElementById('timeline-description').value = item.description || '';
    document.getElementById('timeline-type').value = item.type;
    document.getElementById('timeline-date').value = item.date;
    document.getElementById('timeline-sector').value = item.sectorKey;
    
    document.querySelector('#timeline-form .admin-form-title').textContent = 'Editar Evento';
    showTimelineForm();
}

async function deleteTimeline(id) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    const result = await window.ApiClient.deleteTimeline(id);
    if (result) {
        await loadAdminData();
        renderTimelineTable();
        showNotification('Evento excluído com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir evento', 'error');
    }
}

// ===== KPIs =====
function renderKPITable() {
    const tbody = document.getElementById('kpis-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.kpis.map(kpi => `
        <tr>
            <td>${kpi.key}</td>
            <td>${kpi.value}</td>
            <td>${kpi.unit || '-'}</td>
            <td>${kpi.changePercent ? kpi.changePercent + '%' : '-'}</td>
            <td>${kpi.changePeriod || '-'}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editKPI(${kpi.id})">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteKPI(${kpi.id})">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function saveKPI() {
    const key = document.getElementById('kpi-key').value;
    const value = document.getElementById('kpi-value').value;
    const unit = document.getElementById('kpi-unit').value;
    const changePercent = document.getElementById('kpi-change-percent').value;
    const changePeriod = document.getElementById('kpi-change-period').value;

    if (!key || !value) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const data = { 
        key, 
        value: parseInt(value), 
        unit, 
        changePercent: changePercent ? parseFloat(changePercent) : null, 
        changePeriod 
    };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'kpi') {
        result = await window.ApiClient.updateKPI(AdminData.editingItem.id, data);
    } else {
        result = await window.ApiClient.createKPI(data);
    }

    if (result) {
        await loadAdminData();
        renderKPITable();
        hideKPIForm();
        showNotification('KPI salvo com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar KPI', 'error');
    }
}

async function editKPI(id) {
    const kpi = AdminData.kpis.find(k => k.id === id);
    if (!kpi) return;

    AdminData.editingItem = { type: 'kpi', id };
    
    document.getElementById('kpi-key').value = kpi.key;
    document.getElementById('kpi-key').disabled = true;
    document.getElementById('kpi-value').value = kpi.value;
    document.getElementById('kpi-unit').value = kpi.unit || '';
    document.getElementById('kpi-change-percent').value = kpi.changePercent || '';
    document.getElementById('kpi-change-period').value = kpi.changePeriod || '';
    
    document.querySelector('#kpi-form .admin-form-title').textContent = 'Editar KPI';
    showKPIForm();
}

async function deleteKPI(id) {
    if (!confirm('Tem certeza que deseja excluir este KPI?')) return;

    const result = await window.ApiClient.deleteKPI(id);
    if (result) {
        await loadAdminData();
        renderKPITable();
        showNotification('KPI excluído com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir KPI', 'error');
    }
}

// ===== CHART DATA =====
function renderChartDataTable() {
    const tbody = document.getElementById('chart-data-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.chartData.map(chart => `
        <tr>
            <td>${chart.period}</td>
            <td>${chart.labels.join(', ')}</td>
            <td>${chart.data.join(', ')}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editChartData(${chart.id})">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteChartData(${chart.id})">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function saveChartData() {
    const period = document.getElementById('chart-data-period').value;
    const labelsStr = document.getElementById('chart-data-labels').value;
    const dataStr = document.getElementById('chart-data-values').value;

    if (!labelsStr || !dataStr) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const labels = labelsStr.split(',').map(s => s.trim());
    const data = dataStr.split(',').map(s => parseInt(s.trim()));

    const chartData = { period, labels, data };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'chartData') {
        result = await window.ApiClient.updateChartData(AdminData.editingItem.id, chartData);
    } else {
        result = await window.ApiClient.createChartData(chartData);
    }

    if (result) {
        await loadAdminData();
        renderChartDataTable();
        hideChartDataForm();
        showNotification('Dados de gráfico salvos com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar dados de gráfico', 'error');
    }
}

async function editChartData(id) {
    const chart = AdminData.chartData.find(c => c.id === id);
    if (!chart) return;

    AdminData.editingItem = { type: 'chartData', id };
    
    document.getElementById('chart-data-period').value = chart.period;
    document.getElementById('chart-data-period').disabled = true;
    document.getElementById('chart-data-labels').value = chart.labels.join(', ');
    document.getElementById('chart-data-values').value = chart.data.join(', ');
    
    document.querySelector('#chart-data-form .admin-form-title').textContent = 'Editar Dados de Gráfico';
    showChartDataForm();
}

async function deleteChartData(id) {
    if (!confirm('Tem certeza que deseja excluir estes dados?')) return;

    const result = await window.ApiClient.deleteChartData(id);
    if (result) {
        await loadAdminData();
        renderChartDataTable();
        showNotification('Dados excluídos com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir dados', 'error');
    }
}

// ===== NOTES =====
function renderNotesTable() {
    const tbody = document.getElementById('notes-table-body');
    if (!tbody) return;

    tbody.innerHTML = AdminData.notes.map(note => {
        const sector = AdminData.sectors.find(s => s.key === note.sectorKey);
        const statusClass = note.status === 'completed' ? 'active' : 
                            note.status === 'processing' ? 'paused' : 'inactive';
        const statusText = note.status === 'completed' ? 'Concluída' : 
                          note.status === 'processing' ? 'Processando' : 
                          note.status === 'error' ? 'Erro' : 'Pendente';
        
        return `
        <tr>
            <td>${note.number}</td>
            <td>R$ ${note.value.toFixed(2)}</td>
            <td>${note.issueDate}</td>
            <td>${sector ? sector.name : note.sectorKey}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="admin-actions">
                    <button class="admin-btn-action" onclick="editNote(${note.id})">
                        <span class="material-icons-round">edit</span>
                        Editar
                    </button>
                    <button class="admin-btn-action delete" onclick="deleteNote(${note.id})">
                        <span class="material-icons-round">delete</span>
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

async function saveNote() {
    const number = document.getElementById('note-number').value;
    const value = document.getElementById('note-value').value;
    const issueDate = document.getElementById('note-date').value;
    const sectorKey = document.getElementById('note-sector').value;
    const status = document.getElementById('note-status').value;

    if (!number || !value || !issueDate || !sectorKey) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    const data = { 
        number, 
        value: parseFloat(value), 
        issueDate, 
        sectorKey, 
        status 
    };
    let result;

    if (AdminData.editingItem && AdminData.editingItem.type === 'note') {
        result = await window.ApiClient.updateNote(AdminData.editingItem.id, data);
    } else {
        result = await window.ApiClient.createNote(data);
    }

    if (result) {
        await loadAdminData();
        renderNotesTable();
        hideNoteForm();
        showNotification('Nota salva com sucesso!', 'success');
        AdminData.editingItem = null;
    } else {
        showNotification('Erro ao salvar nota', 'error');
    }
}

async function editNote(id) {
    const note = AdminData.notes.find(n => n.id === id);
    if (!note) return;

    AdminData.editingItem = { type: 'note', id };
    
    document.getElementById('note-number').value = note.number;
    document.getElementById('note-number').disabled = true;
    document.getElementById('note-value').value = note.value;
    document.getElementById('note-date').value = note.issueDate;
    document.getElementById('note-sector').value = note.sectorKey;
    document.getElementById('note-status').value = note.status;
    
    document.querySelector('#note-form .admin-form-title').textContent = 'Editar Nota';
    showNoteForm();
}

async function deleteNote(id) {
    if (!confirm('Tem certeza que deseja excluir esta nota?')) return;

    const result = await window.ApiClient.deleteNote(id);
    if (result) {
        await loadAdminData();
        renderNotesTable();
        showNotification('Nota excluída com sucesso!', 'success');
    } else {
        showNotification('Erro ao excluir nota', 'error');
    }
}

// ===== FORM VISIBILITY =====
function showSectorForm() {
    document.getElementById('sector-form').style.display = 'block';
}

function hideSectorForm() {
    document.getElementById('sector-form').style.display = 'none';
    resetSectorForm();
}

function resetSectorForm() {
    document.getElementById('sector-key').value = '';
    document.getElementById('sector-key').disabled = false;
    document.getElementById('sector-name').value = '';
    document.getElementById('sector-color').value = '#6366f1';
    document.getElementById('sector-icon').value = 'receipt_long';
    document.querySelector('#sector-form .admin-form-title').textContent = 'Adicionar Setor';
    AdminData.editingItem = null;
}

function showAutomationForm() {
    document.getElementById('automation-form').style.display = 'block';
}

function hideAutomationForm() {
    document.getElementById('automation-form').style.display = 'none';
    resetAutomationForm();
}

function resetAutomationForm() {
    document.getElementById('automation-name').value = '';
    document.getElementById('automation-description').value = '';
    document.getElementById('automation-sector').value = '';
    document.getElementById('automation-status').value = 'active';
    document.getElementById('automation-runtime').value = '';
    document.getElementById('automation-running').value = 'false';
    document.querySelector('#automation-form .admin-form-title').textContent = 'Adicionar Automação';
    AdminData.editingItem = null;
}

function showTimelineForm() {
    document.getElementById('timeline-form').style.display = 'block';
}

function hideTimelineForm() {
    document.getElementById('timeline-form').style.display = 'none';
    resetTimelineForm();
}

function resetTimelineForm() {
    document.getElementById('timeline-title').value = '';
    document.getElementById('timeline-description').value = '';
    document.getElementById('timeline-type').value = 'completed';
    document.getElementById('timeline-date').value = '';
    document.getElementById('timeline-sector').value = '';
    document.querySelector('#timeline-form .admin-form-title').textContent = 'Adicionar Evento';
    AdminData.editingItem = null;
}

function showKPIForm() {
    document.getElementById('kpi-form').style.display = 'block';
}

function hideKPIForm() {
    document.getElementById('kpi-form').style.display = 'none';
    resetKPIForm();
}

function resetKPIForm() {
    document.getElementById('kpi-key').value = '';
    document.getElementById('kpi-key').disabled = false;
    document.getElementById('kpi-value').value = '';
    document.getElementById('kpi-unit').value = '';
    document.getElementById('kpi-change-percent').value = '';
    document.getElementById('kpi-change-period').value = '';
    document.querySelector('#kpi-form .admin-form-title').textContent = 'Adicionar KPI';
    AdminData.editingItem = null;
}

function showChartDataForm() {
    document.getElementById('chart-data-form').style.display = 'block';
}

function hideChartDataForm() {
    document.getElementById('chart-data-form').style.display = 'none';
    resetChartDataForm();
}

function resetChartDataForm() {
    document.getElementById('chart-data-period').value = 'hora';
    document.getElementById('chart-data-period').disabled = false;
    document.getElementById('chart-data-labels').value = '';
    document.getElementById('chart-data-values').value = '';
    document.querySelector('#chart-data-form .admin-form-title').textContent = 'Adicionar Dados de Gráfico';
    AdminData.editingItem = null;
}

function showNoteForm() {
    document.getElementById('note-form').style.display = 'block';
}

function hideNoteForm() {
    document.getElementById('note-form').style.display = 'none';
    resetNoteForm();
}

function resetNoteForm() {
    document.getElementById('note-number').value = '';
    document.getElementById('note-number').disabled = false;
    document.getElementById('note-value').value = '';
    document.getElementById('note-date').value = '';
    document.getElementById('note-sector').value = '';
    document.getElementById('note-status').value = 'pending';
    document.querySelector('#note-form .admin-form-title').textContent = 'Adicionar Nota';
    AdminData.editingItem = null;
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="material-icons-round">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== ICON SELECTOR =====
function initIconSelector() {
    const iconSelector = document.getElementById('icon-selector');
    if (!iconSelector) return;

    const iconOptions = iconSelector.querySelectorAll('.icon-option');
    const hiddenInput = document.getElementById('sector-icon');

    iconOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            iconOptions.forEach(opt => opt.classList.remove('selected'));
            // Add selected class to clicked option
            option.classList.add('selected');
            // Update hidden input value
            hiddenInput.value = option.dataset.icon;
        });
    });
}

// ===== INITIALIZE ADMIN =====
async function initAdmin() {
    // Wait for ApiClient to be available
    if (!window.ApiClient) {
        setTimeout(initAdmin, 100);
        return;
    }

    await loadAdminData();

    renderSectorsTable();
    renderAutomationsTable();
    renderTimelineTable();
    renderKPITable();
    renderChartDataTable();
    renderNotesTable();
    populateSectorSelect();
    initIconSelector();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// Make functions globally available for onclick handlers
window.showSectorForm = showSectorForm;
window.hideSectorForm = hideSectorForm;
window.saveSector = saveSector;
window.editSector = editSector;
window.deleteSector = deleteSector;

window.showAutomationForm = showAutomationForm;
window.hideAutomationForm = hideAutomationForm;
window.saveAutomation = saveAutomation;
window.editAutomation = editAutomation;
window.deleteAutomation = deleteAutomation;

window.showTimelineForm = showTimelineForm;
window.hideTimelineForm = hideTimelineForm;
window.saveTimeline = saveTimeline;
window.editTimeline = editTimeline;
window.deleteTimeline = deleteTimeline;

window.showKPIForm = showKPIForm;
window.hideKPIForm = hideKPIForm;
window.saveKPI = saveKPI;
window.editKPI = editKPI;
window.deleteKPI = deleteKPI;

window.showChartDataForm = showChartDataForm;
window.hideChartDataForm = hideChartDataForm;
window.saveChartData = saveChartData;
window.editChartData = editChartData;
window.deleteChartData = deleteChartData;

window.showNoteForm = showNoteForm;
window.hideNoteForm = hideNoteForm;
window.saveNote = saveNote;
window.editNote = editNote;
window.deleteNote = deleteNote;

window.showNotification = showNotification;
