import json

def gerar_visualizador_validado():
    """Gera o HTML final com dados incorporados e validação"""
    
    # Carregar dados
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        carga_data = json.load(f)

    with open('converted/controle_maio_2026.json', 'r', encoding='utf-8') as f:
        controle_data = json.load(f)

    with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
        validation_data = json.load(f)
    
    # Template HTML
    html_template = '''<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visualizador Validado - Planilhas VExpenses</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; color: #333; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .file-selector { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .file-btn { background: #007bff; color: white; padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: background 0.3s; }
        .file-btn:hover { background: #0056b3; }
        .file-btn.active { background: #28a745; }
        .file-info { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .tabs { display: flex; background: white; border-radius: 8px 8px 0 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow-x: auto; }
        .tab { padding: 12px 20px; cursor: pointer; border-right: 1px solid #eee; background: #f8f9fa; white-space: nowrap; transition: background 0.3s; font-size: 14px; }
        .tab:hover { background: #e9ecef; }
        .tab.active { background: white; border-bottom: 2px solid #007bff; font-weight: 600; }
        .table-container { background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: auto; max-height: 600px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; white-space: nowrap; }
        th { background: #f8f9fa; font-weight: 600; position: sticky; top: 0; z-index: 10; }
        tr:hover { background: #f8f9fa; }
        .search-box { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .search-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .stats { display: flex; gap: 20px; margin-top: 10px; flex-wrap: wrap; }
        .stat-item { background: #e9ecef; padding: 8px 12px; border-radius: 4px; font-size: 12px; }
        .hidden { display: none; }
        
        /* Estilos para validação */
        .validated-row { background-color: #d4edda !important; }
        .validated-row:hover { background-color: #c3e6cb !important; }
        .not-validated-row { background-color: #f8d7da !important; }
        .not-validated-row:hover { background-color: #f5c6cb !important; }
        .validation-badge { 
            display: inline-block; 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-size: 10px; 
            font-weight: bold;
            margin-left: 5px;
        }
        .badge-valid { background: #28a745; color: white; }
        .badge-invalid { background: #dc3545; color: white; }
        
        .legend { 
            background: white; 
            padding: 15px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
            margin-bottom: 20px; 
            font-size: 12px;
        }
        .legend-item { display: inline-block; margin-right: 20px; }
        .legend-color { 
            display: inline-block; 
            width: 16px; 
            height: 16px; 
            border-radius: 3px; 
            margin-right: 5px; 
            vertical-align: middle;
        }
        .color-valid { background-color: #d4edda; border: 1px solid #c3e6cb; }
        .color-invalid { background-color: #f8d7da; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Visualizador Validado - VExpenses</h1>
            <p>Planilhas com validação de colaboradores via API VExpenses</p>
        </div>
        
        <div class="file-selector">
            <button class="file-btn active" onclick="loadFile('carga_maio_2026')">📋 Carga Maio 2026</button>
            <button class="file-btn" onclick="loadFile('controle_maio_2026')">📊 Controle Maio 2026</button>
        </div>
        
        <div class="legend" id="legend">
            <div class="legend-item">
                <span class="legend-color color-valid"></span>
                <span>Validado na API (✅)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color color-invalid"></span>
                <span>Não encontrado na API (❌)</span>
            </div>
            <div class="legend-item" id="validationStats">
                <strong>Estatísticas: Carregando...</strong>
            </div>
        </div>
        
        <div class="file-info" id="fileInfo">
            <h3>Selecione uma planilha acima</h3>
        </div>
        
        <div class="search-box hidden" id="searchBox">
            <input type="text" class="search-input" placeholder="🔍 Pesquisar na planilha..." onkeyup="searchTable(this.value)">
        </div>
        
        <div class="tabs hidden" id="tabsContainer"></div>
        <div class="table-container hidden" id="tableContainer">
            <table id="dataTable"></table>
        </div>
    </div>

    <script>
        // Dados incorporados
        const planilhasData = {
            'carga_maio_2026': ''' + json.dumps(carga_data, ensure_ascii=False) + ''',
            'controle_maio_2026': ''' + json.dumps(controle_data, ensure_ascii=False) + '''
        };

        // Dados de validação
        const validationData = ''' + json.dumps(validation_data, ensure_ascii=False) + ''';

        let currentData = {};
        let currentFileName = '';
        let currentSheetName = '';
        let originalData = {};
        let currentValidation = {};

        function loadFile(fileName) {
            try {
                // Atualizar botões
                document.querySelectorAll('.file-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
                
                // Carregar dados
                const data = planilhasData[fileName];
                currentData = data;
                currentFileName = fileName;
                originalData = JSON.parse(JSON.stringify(data));
                
                // Carregar dados de validação se for a planilha carga
                if (fileName === 'carga_maio_2026') {
                    currentValidation = {};
                    // Converter array de validações para mapa por linha
                    if (validationData.validacoes) {
                        validationData.validacoes.forEach(val => {
                            currentValidation[val.linha] = val;
                        });
                    }
                    updateValidationStats();
                } else {
                    currentValidation = {};
                    document.getElementById('validationStats').innerHTML = '<strong>Validação disponível apenas para Carga Maio 2026</strong>';
                }
                
                displayFileInfo(fileName, data);
                displayTabs(data);
                
                // Mostrar primeira aba
                const sheetNames = Object.keys(data);
                if (sheetNames.length > 0) {
                    displaySheet(sheetNames[0]);
                }
                
            } catch (error) {
                console.error('Erro ao carregar planilha:', error);
                alert('Erro ao carregar planilha: ' + error.message);
            }
        }

        function updateValidationStats() {
            const stats = validationData.estatisticas;
            if (stats) {
                document.getElementById('validationStats').innerHTML = 
                    '<strong>Validação:</strong> ' + stats.encontrados + '/' + stats.total + ' encontrados (' + stats.percentual_encontrados.toFixed(1) + '%)';
            }
        }

        function displayFileInfo(fileName, data) {
            const fileInfo = document.getElementById('fileInfo');
            const sheetCount = Object.keys(data).length;
            let totalRows = 0;
            
            Object.values(data).forEach(sheet => {
                totalRows += sheet.length;
            });
            
            const fileNameDisplay = fileName === 'carga_maio_2026' ? 'Carga Maio 2026' : 'Controle Maio 2026';
            
            fileInfo.innerHTML = 
                '<h3>📄 ' + fileNameDisplay + '</h3>' +
                '<div class="stats">' +
                    '<div class="stat-item">📑 Abas: ' + sheetCount + '</div>' +
                    '<div class="stat-item">📊 Total Linhas: ' + totalRows.toLocaleString('pt-BR') + '</div>' +
                '</div>' +
                '<div style="margin-top: 10px;">' +
                    '<strong>Abas disponíveis:</strong> ' + Object.keys(data).join(', ') +
                '</div>';
            
            document.getElementById('searchBox').classList.remove('hidden');
        }

        function displayTabs(data) {
            const tabsContainer = document.getElementById('tabsContainer');
            tabsContainer.innerHTML = '';
            
            Object.keys(data).forEach(sheetName => {
                const tab = document.createElement('div');
                tab.className = 'tab';
                tab.textContent = sheetName;
                tab.onclick = () => displaySheet(sheetName);
                tabsContainer.appendChild(tab);
            });
            
            tabsContainer.classList.remove('hidden');
        }

        function displaySheet(sheetName) {
            if (!currentData) return;
            
            currentSheetName = sheetName;
            
            // Update active tab
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach((tab) => {
                if (tab.textContent === sheetName) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
            
            const sheetData = currentData[sheetName];
            if (!sheetData || sheetData.length === 0) {
                return;
            }
            
            displayTable(sheetData);
        }

        function displayTable(data) {
            const table = document.getElementById('dataTable');
            const tableContainer = document.getElementById('tableContainer');
            
            table.innerHTML = '';
            
            if (data.length === 0) return;
            
            // Create header row
            const headerRow = document.createElement('thead');
            const header = document.createElement('tr');
            
            // Get max columns
            const maxCols = Math.max(...data.map(row => row ? row.length : 0));
            
            for (let i = 0; i < maxCols; i++) {
                const th = document.createElement('th');
                const headerValue = data[0] && data[0][i] ? data[0][i] : 'Coluna ' + (i + 1);
                
                // Adicionar indicador de validação na coluna de colaboradores
                if (i === 0 && currentFileName === 'carga_maio_2026') {
                    th.innerHTML = headerValue + ' <span class="validation-badge badge-valid">API</span>';
                } else {
                    th.textContent = headerValue;
                }
                
                header.appendChild(th);
            }
            
            headerRow.appendChild(header);
            table.appendChild(headerRow);
            
            // Create data rows
            const tbody = document.createElement('tbody');
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;
                
                const tr = document.createElement('tr');
                
                // Verificar validação para esta linha
                if (currentFileName === 'carga_maio_2026' && currentValidation[i]) {
                    const validation = currentValidation[i];
                    if (validation.encontrado_api) {
                        tr.className = 'validated-row';
                    } else {
                        tr.className = 'not-validated-row';
                    }
                }
                
                for (let j = 0; j < maxCols; j++) {
                    const td = document.createElement('td');
                    let cellValue = row && row[j] !== undefined ? row[j] : '';
                    
                    // Adicionar badge de validação na primeira coluna
                    if (j === 0 && currentFileName === 'carga_maio_2026' && currentValidation[i]) {
                        const validation = currentValidation[i];
                        const badge = validation.encontrado_api ? 
                            '<span class="validation-badge badge-valid">✅</span>' : 
                            '<span class="validation-badge badge-invalid">❌</span>';
                        cellValue = cellValue + badge;
                    }
                    
                    td.innerHTML = cellValue;
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            
            tableContainer.classList.remove('hidden');
        }

        function searchTable(searchTerm) {
            if (!currentData || !currentSheetName) return;
            
            const term = searchTerm.toLowerCase().trim();
            if (term === '') {
                displaySheet(currentSheetName);
                return;
            }
            
            const originalSheetData = originalData[currentSheetName];
            if (!originalSheetData) return;
            
            // Filtrar linhas que contêm o termo de busca
            const filteredData = [originalSheetData[0]]; // Manter cabeçalho
            
            for (let i = 1; i < originalSheetData.length; i++) {
                const row = originalSheetData[i];
                if (!row) continue;
                
                const match = row.some(cell => 
                    cell && cell.toString().toLowerCase().includes(term)
                );
                
                if (match) {
                    filteredData.push(row);
                }
            }
            
            displayTable(filteredData);
        }

        // Carregar primeira planilha automaticamente
        window.addEventListener('load', () => {
            const firstBtn = document.querySelector('.file-btn');
            if (firstBtn) {
                firstBtn.click();
            }
        });
    </script>
</body>
</html>'''
    
    # Salvar arquivo
    with open('visualizador_validado_final.html', 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print('✅ Visualizador validado criado com sucesso: visualizador_validado_final.html')

if __name__ == '__main__':
    gerar_visualizador_validado()
