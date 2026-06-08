// Visualizador Otimizado com SQLite
class OptimizedDataViewer {
    constructor() {
        this.apiBaseUrl = 'http://localhost:8001/api';
        this.currentSheet = null;
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalRecords = 0;
        this.filters = {
            search: '',
            status: '',
            name: '',
            cpf: ''
        };
        this.sheets = [];
        this.debounceTimer = null;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Inicializando visualizador otimizado...');
        
        // Carregar planilhas disponíveis
        await this.loadSheets();
        
        // Configurar event listeners
        this.setupEventListeners();
        
        console.log('✅ Visualizador otimizado inicializado');
    }
    
    async loadSheets() {
        try {
            this.showLoading('Carregando planilhas disponíveis...');
            
            const response = await fetch(`${this.apiBaseUrl}/sheets`);
            const data = await response.json();
            
            this.sheets = data.sheets || [];
            this.renderSheetSelector();
            
            this.hideLoading();
            
            if (this.sheets.length === 0) {
                this.showError('Nenhuma planilha encontrada. Verifique se o servidor está rodando.');
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar planilhas:', error);
            this.showError('Erro ao carregar planilhas: ' + error.message);
            this.hideLoading();
        }
    }
    
    renderSheetSelector() {
        const container = document.getElementById('sheet-selector');
        
        if (this.sheets.length === 0) {
            container.innerHTML = '<p>Nenhuma planilha disponível</p>';
            return;
        }
        
        container.innerHTML = this.sheets.map(sheet => `
            <div class="sheet-card" data-sheet="${sheet.name}">
                <div class="sheet-title">${sheet.display_name}</div>
                <div class="sheet-stats">
                    📊 ${sheet.total_rows.toLocaleString('pt-BR')} linhas | 
                    💾 ${(sheet.file_size / 1024 / 1024).toFixed(1)} MB
                </div>
            </div>
        `).join('');
        
        // Adicionar event listeners
        container.querySelectorAll('.sheet-card').forEach(card => {
            card.addEventListener('click', () => {
                const sheetName = card.dataset.sheet;
                this.selectSheet(sheetName);
            });
        });
    }
    
    async selectSheet(sheetName) {
        if (this.currentSheet === sheetName) return;
        
        this.currentSheet = sheetName;
        this.currentPage = 1;
        this.filters = { search: '', status: '', name: '', cpf: '' };
        
        // Atualizar UI
        document.querySelectorAll('.sheet-card').forEach(card => {
            card.classList.toggle('active', card.dataset.sheet === sheetName);
        });
        
        // Mostrar filtros e informações
        document.getElementById('search-filters').style.display = 'grid';
        document.getElementById('file-info').style.display = 'block';
        document.getElementById('legend').style.display = 'flex';
        
        // Carregar informações da planilha
        await this.loadSheetInfo();
        
        // Carregar status options
        await this.loadStatusOptions();
        
        // Carregar dados
        await this.loadData();
    }
    
    async loadSheetInfo() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/sheet-info?sheet=${this.currentSheet}`);
            const data = await response.json();
            
            this.renderSheetInfo(data);
            
        } catch (error) {
            console.error('❌ Erro ao carregar informações da planilha:', error);
        }
    }
    
    renderSheetInfo(data) {
        const container = document.getElementById('file-info');
        const stats = data.statistics;
        
        container.innerHTML = `
            <h3>📄 ${data.metadata.sheet_name.replace(/_/g, ' ').toUpperCase()}</h3>
            <div class="stats">
                <div class="stat-item">Total de linhas: ${stats.total_rows.toLocaleString('pt-BR')}</div>
                <div class="stat-item">Colaboradores únicos: ${stats.unique_members.toLocaleString('pt-BR')}</div>
                <div class="stat-item">Status diferentes: ${stats.unique_statuses}</div>
                <div class="stat-item">Valor total: R$ ${(stats.total_value || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                <div class="stat-item">Valor médio: R$ ${(stats.avg_value || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
            </div>
        `;
    }
    
    async loadStatusOptions() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/sheet-info?sheet=${this.currentSheet}`);
            const data = await response.json();
            
            const statusSelect = document.getElementById('status-filter');
            const statuses = data.status_distribution || [];
            
            statusSelect.innerHTML = '<option value="">Todos os status</option>' +
                statuses.map(s => `<option value="${s.status}">${s.status} (${s.count})</option>`).join('');
                
        } catch (error) {
            console.error('❌ Erro ao carregar opções de status:', error);
        }
    }
    
    async loadData() {
        try {
            this.showLoading('Carregando dados...');
            
            const params = new URLSearchParams({
                sheet: this.currentSheet,
                page: this.currentPage,
                per_page: this.pageSize
            });
            
            // Adicionar filtros
            if (this.filters.status) params.append('status', this.filters.status);
            if (this.filters.name) params.append('name', this.filters.name);
            if (this.filters.cpf) params.append('cpf', this.filters.cpf);
            
            const response = await fetch(`${this.apiBaseUrl}/expenses?${params}`);
            const data = await response.json();
            
            this.totalRecords = data.pagination.total;
            this.renderTable(data.data);
            this.renderPagination(data.pagination);
            
            this.hideLoading();
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            this.showError('Erro ao carregar dados: ' + error.message);
            this.hideLoading();
        }
    }
    
    renderTable(data) {
        const container = document.getElementById('table-container');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="padding: 20px; text-align: center;">Nenhum dado encontrado</p>';
            return;
        }
        
        // Criar tabela
        const table = document.createElement('table');
        table.innerHTML = this.generateTableHTML(data);
        
        container.innerHTML = '';
        container.appendChild(table);
    }
    
    generateTableHTML(data) {
        if (data.length === 0) return '';
        
        // Cabeçalho
        const headers = Object.keys(data[0]);
        const headerRow = headers.map(header => 
            `<th>${this.formatHeader(header)}</th>`
        ).join('');
        
        // Corpo da tabela
        const bodyRows = data.map(row => {
            const cells = headers.map(header => {
                const value = row[header];
                const formattedValue = this.formatCellValue(header, value);
                return `<td>${formattedValue}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        
        return `
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${bodyRows}</tbody>
        `;
    }
    
    formatHeader(header) {
        const headerMap = {
            'row_number': 'Linha',
            'expense_id': 'ID Despesa',
            'report_id': 'ID Relatório',
            'report_name': 'Relatório',
            'expense_date': 'Data',
            'member_name': 'Colaborador',
            'member_cpf': 'CPF',
            'bank': 'Banco',
            'agency': 'Agência',
            'account': 'Conta',
            'pix': 'PIX',
            'status': 'Status',
            'payment_date': 'Pagamento',
            'expense_description': 'Descrição',
            'expense_value': 'Valor',
            'cost_center': 'Centro Custo',
            'project': 'Projeto',
            'category': 'Categoria',
            'approved_by': 'Aprovado por'
        };
        
        return headerMap[header] || header;
    }
    
    formatCellValue(header, value) {
        if (value === null || value === undefined) return '';
        
        // Formatação especial para diferentes tipos de dados
        switch (header) {
            case 'expense_value':
                return `R$ ${parseFloat(value || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                
            case 'expense_date':
            case 'payment_date':
                if (!value) return '';
                try {
                    return new Date(value).toLocaleDateString('pt-BR');
                } catch {
                    return value;
                }
                
            case 'status':
                const statusColors = {
                    'APROVADO': '#28a745',
                    'REPROVADO': '#dc3545',
                    'PENDENTE': '#ffc107',
                    'PAGO': '#17a2b8'
                };
                const color = statusColors[value] || '#6c757d';
                return `<span style="color: white; background: ${color}; padding: 2px 8px; border-radius: 3px; font-size: 11px;">${value}</span>`;
                
            case 'member_cpf':
                if (!value) return '';
                // Format CPF
                const cpf = value.toString().replace(/\D/g, '');
                if (cpf.length === 11) {
                    return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`;
                }
                return value;
                
            default:
                return value;
        }
    }
    
    renderPagination(pagination) {
        const container = document.getElementById('table-container');
        
        if (pagination.total_pages <= 1) return;
        
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-controls';
        paginationDiv.innerHTML = `
            <div class="pagination-info">
                <span>Mostrando ${pagination.page * pagination.per_page - pagination.per_page + 1}-${Math.min(pagination.page * pagination.per_page, pagination.total)} de ${pagination.total.toLocaleString('pt-BR')} registros</span>
            </div>
            <div class="pagination-buttons">
                <button onclick="viewer.goToPage(${pagination.page - 1})" ${!pagination.has_prev ? 'disabled' : ''}>Anterior</button>
                <span>Página ${pagination.page} de ${pagination.total_pages}</span>
                <button onclick="viewer.goToPage(${pagination.page + 1})" ${!pagination.has_next ? 'disabled' : ''}>Próxima</button>
            </div>
        `;
        
        container.appendChild(paginationDiv);
    }
    
    goToPage(page) {
        if (page < 1 || page > Math.ceil(this.totalRecords / this.pageSize)) return;
        
        this.currentPage = page;
        this.loadData();
    }
    
    setupEventListeners() {
        // Busca rápida
        const quickSearch = document.getElementById('quick-search');
        quickSearch.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.performGlobalSearch(e.target.value);
            }, 500);
        });
        
        // Filtros
        ['status-filter', 'name-filter', 'cpf-filter'].forEach(filterId => {
            const element = document.getElementById(filterId);
            element.addEventListener('change', () => {
                this.updateFilters();
            });
            
            if (element.tagName === 'INPUT') {
                element.addEventListener('input', () => {
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.updateFilters();
                    }, 300);
                });
            }
        });
    }
    
    updateFilters() {
        this.filters.status = document.getElementById('status-filter').value;
        this.filters.name = document.getElementById('name-filter').value;
        this.filters.cpf = document.getElementById('cpf-filter').value;
        
        this.currentPage = 1;
        this.loadData();
    }
    
    async performGlobalSearch(searchTerm) {
        if (!searchTerm.trim()) {
            this.loadData();
            return;
        }
        
        try {
            this.showLoading('Buscando em todos os dados...');
            
            const params = new URLSearchParams({
                q: searchTerm,
                page: this.currentPage,
                per_page: this.pageSize
            });
            
            if (this.currentSheet) {
                params.append('sheet', this.currentSheet);
            }
            
            const response = await fetch(`${this.apiBaseUrl}/search?${params}`);
            const data = await response.json();
            
            this.totalRecords = data.pagination.total;
            this.renderTable(data.results);
            this.renderPagination(data.pagination);
            
            this.hideLoading();
            
        } catch (error) {
            console.error('❌ Erro na busca:', error);
            this.showError('Erro na busca: ' + error.message);
            this.hideLoading();
        }
    }
    
    showLoading(message = 'Carregando...') {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');
        
        messageEl.textContent = message;
        overlay.style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    showError(message) {
        const container = document.getElementById('table-container');
        container.innerHTML = `
            <div style="padding: 20px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24;">
                <strong>❌ Erro:</strong> ${message}
            </div>
        `;
    }
}

// Inicializar quando a página carregar
let viewer;
window.addEventListener('DOMContentLoaded', () => {
    viewer = new OptimizedDataViewer();
});

// Funções globais para paginação
window.goToPage = (page) => {
    if (viewer) viewer.goToPage(page);
};
