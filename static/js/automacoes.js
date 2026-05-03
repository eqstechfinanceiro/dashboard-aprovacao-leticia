// ===== AUTOMAÇÕES MODULE =====

// ===== KANBAN BOARD =====
class KanbanBoard {
    constructor() {
        this.container = document.getElementById('kanban-board');
        if (this.container) {
            this.currentFilter = 'all';
            this.render();
            this.bindFilters();
            this.bindActions();
        }
    }

    render() {
        const html = window.AppData.sectors.map(sector => {
            const automations = window.AppData.automations.filter(a => a.sectorKey === sector.key);
            const filtered = this.currentFilter === 'all'
                ? automations
                : automations.filter(a => a.status === this.currentFilter);

            return `
                <div class="kanban-column" data-sector="${sector.key}">
                    <div class="kanban-column-header">
                        <div class="kanban-column-title">
                            <span class="material-icons-round" style="color: ${sector.color}">${sector.icon}</span>
                            <h3>${sector.name}</h3>
                            <span class="kanban-count">${filtered.length}</span>
                        </div>
                    </div>
                    <div class="kanban-column-content">
                        ${filtered.map(automation => `
                            <div class="kanban-card" data-id="${automation.id}" data-status="${automation.status}">
                                <div class="kanban-card-header">
                                    <span class="kanban-card-status ${automation.status}">${automation.status}</span>
                                    <div class="kanban-card-actions">
                                        <button class="kanban-card-action" data-action="edit">
                                            <span class="material-icons-round">edit</span>
                                        </button>
                                        <button class="kanban-card-action" data-action="delete">
                                            <span class="material-icons-round">delete</span>
                                        </button>
                                    </div>
                                </div>
                                <h4 class="kanban-card-title">${automation.name}</h4>
                                <p class="kanban-card-description">${automation.description}</p>
                                <div class="kanban-card-footer">
                                    <span class="kanban-card-runtime">
                                        <span class="material-icons-round" style="font-size: 14px">schedule</span>
                                        ${automation.runtime}
                                    </span>
                                    <span class="kanban-card-sector">${automation.sector}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        this.container.innerHTML = html;
    }

    bindFilters() {
        const filters = document.querySelectorAll('.filter-btn');
        filters.forEach(btn => {
            btn.addEventListener('click', () => {
                filters.forEach(f => f.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.render();
            });
        });
    }

    bindActions() {
        const actionButtons = this.container.querySelectorAll('.kanban-card-action');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const card = btn.closest('.kanban-card');
                const id = parseInt(card.dataset.id);

                if (action === 'edit') {
                    this.editAutomation(id);
                } else if (action === 'delete') {
                    this.deleteAutomation(id);
                }
            });
        });
    }

    async editAutomation(id) {
        const automation = window.AppData.automations.find(a => a.id === id);
        if (!automation) return;

        // Redirect to admin page with edit mode
        window.location.href = `/pages/admin.html?edit=automation&id=${id}`;
    }

    async deleteAutomation(id) {
        if (!confirm('Tem certeza que deseja excluir esta automação?')) return;

        try {
            const result = await window.ApiClient.deleteAutomation(id);
            if (result) {
                await window.loadAppData();
                this.render();
                alert('Automação excluída com sucesso!');
            } else {
                alert('Erro ao excluir automação');
            }
        } catch (error) {
            console.error('Error deleting automation:', error);
            alert('Erro ao excluir automação');
        }
    }
}

// ===== INITIALIZE AUTOMAÇÕES =====
async function initAutomacoes() {
    await window.loadAppData();
    new KanbanBoard();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutomacoes);
} else {
    initAutomacoes();
}
