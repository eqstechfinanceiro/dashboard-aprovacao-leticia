// Configuração de paginação
const PAGINATION_CONFIG = {
    pageSize: 50,
    maxPages: 10,
    virtualScrolling: true
};

// Dados globais
let planilhaData = {};
let apiMembersCache = null; // Cache de membros da API
let formulasData = null; // Cache de fórmulas do Excel
let currentSheetName = '';
let originalData = {};
let currentFile = 'carga_maio_2026.json';
let currentPage = 1;
let totalRows = 0;
let filteredData = null;

// Configuração da API VExpenses (usando proxy local)
const API_CONFIG = {
    baseUrl: '/api' // Proxy local via server.py
};

// Mapeamento de arquivos disponíveis
const availableFiles = {
    'carga_maio_2026.json': {
        name: 'Carga Maio 2026',
        path: '../converted/carga_maio_2026.json'
    },
    'controle_maio_2026.json': {
        name: 'Controle Maio 2026',
        path: '../converted/controle_maio_2026.json'
    },
    'base_prest_2025_05_api.json': {
        name: 'Base Prest (API)',
        path: '../base_prest_2025_05_api.json'
    }
};

// Buscar todos os membros da API VExpenses
async function fetchTeamMembers() {
    if (apiMembersCache) {
        console.log('Usando cache de membros da API');
        return apiMembersCache;
    }

    console.log('📡 Buscando dados da API VExpenses...');
    const allMembers = [];
    let page = 1;

    while (true) {
        try {
            const params = new URLSearchParams({
                include: 'costsCenters,projects',
                paginate: 'true',
                page: page.toString(),
                per_page: '100'
            });

            const response = await fetch(
                `${API_CONFIG.baseUrl}/team-members?${params}`,
                {
                    headers: {
                        'Authorization': API_CONFIG.apiKey,
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.status === 200) {
                const data = await response.json();
                const members = data.data || [];

                if (!members || members.length === 0) {
                    break;
                }

                allMembers.push(...members);
                console.log(`📄 Página ${page}: ${members.length} membros`);
                page++;

                // Pequena pausa para não sobrecarregar a API
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                console.error(`❌ Erro na página ${page}: ${response.status}`);
                break;
            }
        } catch (error) {
            console.error(`❌ Erro ao buscar página ${page}:`, error);
            break;
        }
    }

    console.log(`✅ Total de ${allMembers.length} membros carregados da API`);
    apiMembersCache = allMembers;
    return allMembers;
}

// Buscar colaborador na API por CPF ou nome
function findMemberInAPI(cpf, name, apiMembers) {
    if (!apiMembers) return null;

    // Limpar CPF
    const cleanCpf = cpf ? cpf.toString().replace(/\D/g, '') : '';

    // Buscar por CPF primeiro
    if (cleanCpf) {
        const byCpf = apiMembers.find(m => m.cpf === cleanCpf);
        if (byCpf) return { found: true, data: byCpf };
    }

    // Buscar por nome
    if (name) {
        const normalizedName = name.toString().toUpperCase().trim();
        const byName = apiMembers.find(m =>
            m.name && m.name.toUpperCase().trim() === normalizedName
        );
        if (byName) return { found: true, data: byName };
    }

    return { found: false, data: null };
}

// Carregar fórmulas do Excel
async function loadFormulas() {
    if (formulasData) {
        console.log('Usando cache de fórmulas');
        return formulasData;
    }

    console.log('📊 Carregando fórmulas do Excel...');
    try {
        const response = await fetch('/formulas_controle.json');
        formulasData = await response.json();
        console.log('✅ Fórmulas carregadas');
        return formulasData;
    } catch (error) {
        console.error('❌ Erro ao carregar fórmulas:', error);
        return null;
    }
}

// Verificar se uma célula é fórmula
function isFormulaCell(rowIndex, colIndex, sheetName) {
    if (!formulasData || !formulasData[sheetName]) return null;

    // O arquivo de fórmulas tem uma estrutura esparsa (apenas linhas com fórmulas)
    // Precisamos mapear corretamente para o índice da linha no JSON
    const sheetFormulas = formulasData[sheetName];
    
    // Buscar na linha correspondente (ajustando para índice 0-based)
    const formulaRow = sheetFormulas[rowIndex];
    if (formulaRow && formulaRow[colIndex]) {
        return formulaRow[colIndex].formula;
    }
    
    return null;
}

// Carregar dados do arquivo JSON
async function loadFileData(filename) {
    try {
        const fileInfo = availableFiles[filename];
        const response = await fetch(fileInfo.path);
        const data = await response.json();

        planilhaData = data;
        originalData = JSON.parse(JSON.stringify(data));

        // Buscar dados da API em tempo real
        await fetchTeamMembers();

        // Carregar fórmulas do Excel (apenas para controle)
        if (filename === 'controle_maio_2026.json') {
            await loadFormulas();
        }

        currentFile = filename;
        displayFileInfo();
        displayTabs();

        // Mostrar primeira aba
        const sheetNames = Object.keys(planilhaData);
        if (sheetNames.length > 0) {
            displaySheet(sheetNames[0]);
        }

        updateFileButtons();
    } catch (error) {
        console.error('Erro ao carregar arquivo:', error);
        alert('Erro ao carregar arquivo: ' + error.message);
    }
}

// Exibir informações do arquivo
function displayFileInfo() {
    const fileInfo = document.getElementById('file-info');
    if (!fileInfo) return;
    
    const file = availableFiles[currentFile];
    const sheetCount = Object.keys(planilhaData).length;
    const totalRows = Object.values(planilhaData).reduce((sum, sheet) => sum + sheet.length, 0);
    
    fileInfo.innerHTML = `
        <h3>📄 Arquivo: ${file.name}</h3>
        <div class="stats">
            <div class="stat-item">Abas: ${sheetCount}</div>
            <div class="stat-item">Total de linhas: ${totalRows}</div>
        </div>
    `;
}

// Exibir abas
function displayTabs() {
    const tabsContainer = document.getElementById('tabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    Object.keys(planilhaData).forEach(sheetName => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (sheetName === currentSheetName ? ' active' : '');
        tab.textContent = sheetName;
        tab.onclick = () => displaySheet(sheetName);
        tabsContainer.appendChild(tab);
    });
}

// Exibir planilha
function displaySheet(sheetName) {
    currentSheetName = sheetName;
    
    // Atualizar abas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent === sheetName) {
            tab.classList.add('active');
        }
    });
    
    const data = planilhaData[sheetName];
    displayTable(data, sheetName);
}

// Exibir tabela com paginação
function displayTable(data, sheetName, page = 1) {
    const tableContainer = document.getElementById('table-container');
    if (!tableContainer) return;
    
    tableContainer.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableContainer.innerHTML = '<p style="padding: 20px;">Nenhum dado encontrado</p>';
        return;
    }
    
    currentPage = page;
    filteredData = data;
    totalRows = data.length;
    
    // Adicionar controles de paginação
    createPaginationControls();
    
    // Calcular dados da página atual
    const startIndex = (page - 1) * PAGINATION_CONFIG.pageSize;
    const endIndex = Math.min(startIndex + PAGINATION_CONFIG.pageSize, data.length);
    const pageData = data.slice(startIndex, endIndex);
    
    console.log(`Renderizando página ${page}: ${pageData.length} de ${data.length} linhas`);
    
    renderTableContent(pageData, sheetName, startIndex);
}
    
// Renderizar conteúdo da tabela
function renderTableContent(data, sheetName, startRow = 0) {
    const tableContainer = document.getElementById('table-container');
    
    const table = document.createElement('table');
    table.id = 'data-table';
    
    // Encontrar a linha do cabeçalho (procurar por COLABORADOR/PORTADOR, CPF, SITUAÇÃO)
    let headerRowIndex = 0;
    let nameColIndex = -1;
    let cpfColIndex = -1;
    let statusColIndex = -1;
    
    // Procurar em até as primeiras 100 linhas pelo cabeçalho
    for (let i = 0; i < Math.min(100, filteredData.length); i++) {
        const row = filteredData[i];
        if (!row) continue;
        
        const tempNameIdx = row.findIndex(h => h && (h.toString().toUpperCase().includes('COLABORADOR') || h.toString().toUpperCase().includes('PORTADOR')));
        const tempCpfIdx = row.findIndex(h => h && h.toString().toUpperCase() === 'CPF');
        const tempStatusIdx = row.findIndex(h => h && (h.toString().toUpperCase().includes('SITUAÇÃO') || h.toString().toUpperCase().includes('STATUS')));
        
        // Se encontrou pelo menos COLABORADOR/PORTADOR e CPF, consideramos o cabeçalho encontrado
        if (tempNameIdx >= 0 && tempCpfIdx >= 0) {
            headerRowIndex = i;
            nameColIndex = tempNameIdx;
            cpfColIndex = tempCpfIdx;
            statusColIndex = tempStatusIdx;
            break;
        }
    }
    
    console.log('Cabeçalho encontrado na linha:', headerRowIndex);
    console.log('Colunas detectadas - Nome:', nameColIndex, 'CPF:', cpfColIndex, 'Status:', statusColIndex);
    
    // Criar cabeçalho
    const headerRowEl = document.createElement('tr');
    const maxCols = Math.max(...filteredData.map(row => row ? row.length : 0));
    
    for (let j = 0; j < maxCols; j++) {
        const header = document.createElement('th');
        const headerValue = filteredData[headerRowIndex] && filteredData[headerRowIndex][j] !== undefined ? filteredData[headerRowIndex][j] : `Coluna ${j + 1}`;
        
        // Adicionar badge de validação para colunas específicas
        if (j === nameColIndex) {
            header.innerHTML = headerValue + ' <span class="validation-badge badge-valid">Nome</span>';
        } else if (j === cpfColIndex) {
            header.innerHTML = headerValue + ' <span class="validation-badge badge-valid">CPF</span>';
        } else if (j === statusColIndex) {
            header.innerHTML = headerValue + ' <span class="validation-badge badge-valid">Status</span>';
        } else {
            header.textContent = headerValue;
        }
        
        headerRowEl.appendChild(header);
    }
    
    table.appendChild(headerRowEl);
    
    // Criar linhas de dados com renderização otimizada
    const tbody = document.createElement('tbody');
    
    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < data.length; i++) {
        const actualRow = startRow + i;
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = actualRow;
        
        for (let j = 0; j < maxCols; j++) {
            const td = document.createElement('td');
            let cellValue = row && row[j] !== undefined ? row[j] : '';
            let cellHtml = '';
            
            // Verificar se é uma fórmula (apenas para controle)
            const formula = (currentFile === 'controle_maio_2026.json') ? isFormulaCell(actualRow, j, sheetName) : null;
            
            if (formula) {
                td.className = 'cell-formula';
                cellHtml = cellValue + ' <span class="validation-badge badge-formula">fx</span>';
                cellHtml += '<span class="api-indicator">Fórmula original: <span class="api-value">' + formula + '</span></span>';
            } else {
                // Validação simplificada para grandes conjuntos de dados
                if (totalRows > 10000) {
                    // Para datasets grandes, apenas mostrar os dados sem validação API em tempo real
                    const isNameCell = (j === nameColIndex);
                    const isCpfCell = (j === cpfColIndex);
                    const isStatusCell = (j === statusColIndex);
                    
                    if (isNameCell || isCpfCell || isStatusCell) {
                        cellHtml = cellValue + ' <span class="validation-badge badge-pending">⏳</span>';
                        cellHtml += '<span class="api-indicator">Validação em segundo plano</span>';
                        td.className = 'cell-pending';
                    } else {
                        cellHtml = cellValue;
                    }
                } else {
                    // Para datasets pequenos, manter validação em tempo real
                    const currentName = nameColIndex >= 0 ? (row[nameColIndex] || '') : '';
                    const currentCpf = cpfColIndex >= 0 ? (row[cpfColIndex] || '') : '';
                    
                    const apiResult = findMemberInAPI(currentCpf, currentName, apiMembersCache);
                    
                    const isNameCell = (j === nameColIndex);
                    const isCpfCell = (j === cpfColIndex);
                    const isStatusCell = (j === statusColIndex);
                    const shouldValidate = (isNameCell || isCpfCell || isStatusCell);
                    
                    if (shouldValidate) {
                        if (!apiResult || !apiResult.found) {
                            td.className = 'cell-not-found';
                            cellHtml = cellValue + ' <span class="validation-badge badge-not-found">?</span>';
                            cellHtml += '<span class="api-indicator">Não encontrado na API</span>';
                        } else {
                            const apiData = apiResult.data;
                            let apiValue = '';
                            let isDataEqual = false;
                            
                            if (isNameCell) {
                                apiValue = apiData.name || '';
                                isDataEqual = cellValue.trim().toUpperCase() === apiValue.trim().toUpperCase();
                                if (isDataEqual) {
                                    td.className = 'cell-validated';
                                    cellHtml = cellValue + ' <span class="validation-badge badge-valid">✓</span>';
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value">' + apiValue + '</span></span>';
                                } else {
                                    td.className = 'cell-invalid';
                                    cellHtml = cellValue + ' <span class="validation-badge badge-invalid">✗</span>';
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value-invalid">' + apiValue + '</span></span>';
                                }
                            } else if (isCpfCell) {
                                apiValue = apiData.cpf || '';
                                isDataEqual = cellValue.trim() === apiValue.trim();
                                if (isDataEqual) {
                                    td.className = 'cell-validated';
                                    cellHtml = cellValue;
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value">' + apiValue + '</span></span>';
                                } else {
                                    td.className = 'cell-invalid';
                                    cellHtml = cellValue;
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value-invalid">' + apiValue + '</span></span>';
                                }
                            } else if (isStatusCell) {
                                apiValue = apiData.active ? 'ATIVO' : 'INATIVO';
                                isDataEqual = cellValue.trim().toUpperCase() === apiValue.trim().toUpperCase();
                                if (isDataEqual) {
                                    td.className = 'cell-validated';
                                    cellHtml = cellValue;
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value">' + apiValue + '</span></span>';
                                } else {
                                    td.className = 'cell-invalid';
                                    cellHtml = cellValue;
                                    cellHtml += '<span class="api-indicator">API mostra: <span class="api-value-invalid">' + apiValue + '</span></span>';
                                }
                            }
                        }
                    } else {
                        cellHtml = cellValue;
                    }
                }
            }
            
            td.innerHTML = cellHtml;
            tr.appendChild(td);
        }
        fragment.appendChild(tr);
    }
    
    tbody.appendChild(fragment);
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    tableContainer.style.display = 'block';
    
    // Se for um dataset grande, agendar validação em segundo plano
    if (totalRows > 10000) {
        setTimeout(() => scheduleBackgroundValidation(), 100);
    }
}

// Criar controles de paginação
function createPaginationControls() {
    const tableContainer = document.getElementById('table-container');
    
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls';
    paginationDiv.innerHTML = `
        <div class="pagination-info">
            <span>Mostrando ${(currentPage - 1) * PAGINATION_CONFIG.pageSize + 1}-${Math.min(currentPage * PAGINATION_CONFIG.pageSize, totalRows)} de ${totalRows} linhas</span>
        </div>
        <div class="pagination-buttons">
            <button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${currentPage} de ${Math.ceil(totalRows / PAGINATION_CONFIG.pageSize)}</span>
            <button onclick="goToPage(${currentPage + 1})" ${currentPage >= Math.ceil(totalRows / PAGINATION_CONFIG.pageSize) ? 'disabled' : ''}>Próxima</button>
        </div>
    `;
    
    tableContainer.appendChild(paginationDiv);
}

// Navegar para página específica
function goToPage(page) {
    const totalPages = Math.ceil(totalRows / PAGINATION_CONFIG.pageSize);
    if (page < 1 || page > totalPages) return;
    
    displayTable(filteredData, currentSheetName, page);
}

// Validação em segundo plano para datasets grandes
function scheduleBackgroundValidation() {
    if (!apiMembersCache || totalRows <= 10000) return;
    
    console.log('Iniciando validação em segundo plano...');
    
    // Processar em lotes para não bloquear a UI
    const batchSize = 100;
    let currentBatch = 0;
    
    function processBatch() {
        const startIdx = currentBatch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, filteredData.length);
        
        for (let i = startIdx; i < endIdx; i++) {
            const row = filteredData[i];
            if (!row) continue;
            
            // Encontrar células que precisam de validação
            const rowElement = document.querySelector(`tr[data-row-index="${i}"]`);
            if (rowElement) {
                // Atualizar células com validação real
                updateRowValidation(rowElement, row, i);
            }
        }
        
        currentBatch++;
        
        if (startIdx < filteredData.length) {
            // Processar próximo lote após um pequeno delay
            setTimeout(processBatch, 50);
        } else {
            console.log('Validação em segundo plano concluída');
        }
    }
    
    processBatch();
}

// Atualizar validação de uma linha específica
function updateRowValidation(rowElement, rowData, rowIndex) {
    // Implementar atualização de validação para linha específica
    // Esta função pode ser chamada pela validação em segundo plano
}

// Buscar na tabela com paginação
function searchTable(searchTerm) {
    if (!currentSheetName || !originalData[currentSheetName]) return;
    
    const term = searchTerm.toLowerCase().trim();
    if (term === '') {
        displaySheet(currentSheetName);
        return;
    }
    
    const originalSheetData = originalData[currentSheetName];
    
    // Para datasets grandes, mostrar indicador de carregamento
    if (originalSheetData.length > 10000) {
        const tableContainer = document.getElementById('table-container');
        tableContainer.innerHTML = '<div class="loading-indicator">🔍 Buscando em ' + originalSheetData.length.toLocaleString('pt-BR') + ' linhas...</div>';
        
        // Usar setTimeout para não bloquear a UI
        setTimeout(() => performSearch(originalSheetData, term), 100);
    } else {
        performSearch(originalSheetData, term);
    }
}

// Executar busca de forma assíncrona
function performSearch(data, term) {
    // Filtrar linhas que contêm o termo de busca
    const filteredData = [data[0]]; // Manter cabeçalho
    
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        const match = row.some(cell =>
            cell && cell.toString().toLowerCase().includes(term)
        );
        
        if (match) {
            filteredData.push(row);
        }
    }
    
    displayTable(filteredData, currentSheetName);
}

// Atualizar botões de arquivo
function updateFileButtons() {
    document.querySelectorAll('.file-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.file === currentFile) {
            btn.classList.add('active');
        }
    });
}

// Inicialização
window.addEventListener('load', () => {
    console.log('Inicializando visualizador...');
    
    // Criar botões de seleção de arquivo
    const fileSelector = document.getElementById('file-selector');
    if (fileSelector) {
        Object.keys(availableFiles).forEach(filename => {
            const btn = document.createElement('button');
            btn.className = 'file-btn';
            btn.dataset.file = filename;
            btn.textContent = availableFiles[filename].name;
            btn.onclick = () => loadFileData(filename);
            fileSelector.appendChild(btn);
        });
    }
    
    // Carregar arquivo padrão
    loadFileData('carga_maio_2026.json');
    
    // Configurar busca
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTable(e.target.value);
        });
    }
    
    console.log('Visualizador inicializado');
});
