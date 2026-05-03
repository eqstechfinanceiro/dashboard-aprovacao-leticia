// ===== PROGRESSO MODULE =====

// ===== TIMELINE =====
class Timeline {
    constructor() {
        this.container = document.getElementById('timeline-container');
        if (this.container) {
            this.currentFilter = 'all';
            this.currentSector = 'all';
            this.render();
            this.bindFilters();
        }
    }

    render() {
        let items = [...window.AppData.timeline];

        // Filter by type
        if (this.currentFilter !== 'all') {
            items = items.filter(item => item.type === this.currentFilter);
        }

        // Filter by sector
        if (this.currentSector !== 'all') {
            items = items.filter(item => item.sectorKey === this.currentSector);
        }

        const typeLabels = {
            'deployment': 'Deploy',
            'fix': 'Correção',
            'improvement': 'Melhoria',
            'feature': 'Funcionalidade'
        };

        const html = items.map(item => {
            let actionsHtml = '';
            if (item.actions && item.actions.length > 0) {
                actionsHtml = `
                    <div class="timeline-actions">
                        <h5>Plano de Ação</h5>
                        <ul class="timeline-action-list">
                            ${item.actions.map(action => `
                                <li class="${action.done ? 'done' : 'pending'}">
                                    <span class="material-icons-round">${action.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                                    ${action.text}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }

            return `
                <div class="timeline-item" data-type="${item.type}" data-sector="${item.sectorKey}">
                    <div class="timeline-dot ${item.type}"></div>
                    <div class="timeline-card">
                        <div class="timeline-card-header">
                            <span class="timeline-date">
                                <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">calendar_today</span>
                                ${item.date}
                            </span>
                            <div class="timeline-tags">
                                <span class="timeline-tag ${item.type}">${typeLabels[item.type]}</span>
                                <span class="timeline-tag sector">${item.sector}</span>
                            </div>
                        </div>
                        <h4 class="timeline-title">${item.title}</h4>
                        <p class="timeline-description">${item.description}</p>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        this.container.innerHTML = html;
    }

    bindFilters() {
        const filterBtns = document.querySelectorAll('.timeline-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.render();
            });
        });

        const sectorSelect = document.getElementById('timeline-sector-filter');
        if (sectorSelect) {
            sectorSelect.addEventListener('change', (e) => {
                this.currentSector = e.target.value;
                this.render();
            });
        }
    }
}

// ===== INITIALIZE PROGRESSO =====
async function initProgresso() {
    await window.loadAppData();
    new Timeline();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProgresso);
} else {
    initProgresso();
}
