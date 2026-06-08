import json

def gerar_visualizador_final():
    """Gera o HTML final com dados incorporados de ambas as planilhas e validação específica por célula"""
    
    # Carregar dados da Carga Maio 2026
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        carga_data = json.load(f)

    # Carregar dados do Controle Maio 2026
    with open('converted/controle_maio_2026.json', 'r', encoding='utf-8') as f:
        controle_data = json.load(f)

    # Carregar dados de validação
    with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
        validation_data = json.load(f)
    
    # Ler template HTML
    with open('../visualizador_com_indicadores.html', 'r', encoding='utf-8') as f:
        html_template = f.read()
    
    # Substituir placeholders com dados de ambas as planilhas
    html_template = html_template.replace(
        'const planilhaData = {"Planilha1":',
        f'const planilhaData = {{"Carga Maio 2026": {json.dumps(carga_data.get("Planilha1", {}), ensure_ascii=False)}, "Controle Maio 2026": {json.dumps(controle_data, ensure_ascii=False)}}}; // Dados de ambas as planilhas'
    )
    
    # Remover o placeholder antigo se existir
    if 'const planilhaData = {"Planilha1":' in html_template:
        # Já foi substituído acima
        pass
    else:
        # Buscar e substituir o padrão atual
        html_template = html_template.replace(
            'const planilhaData =',
            f'const planilhaData = {json.dumps({"Carga Maio 2026": carga_data, "Controle Maio 2026": controle_data}, ensure_ascii=False)};'
        )
    
    html_template = html_template.replace(
        'const validationData =',
        f'const validationData = {json.dumps(validation_data, ensure_ascii=False)};'
    )
    
    # Salvar arquivo final
    with open('../visualizador_com_indicadores_dual.html', 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print('✅ Visualizador dual criado: visualizador_com_indicadores_dual.html')
    print('📋 Recursos implementados:')
    print('   - Dados de Carga Maio 2026 e Controle Maio 2026')
    print('   - Validação apenas em células específicas (nome e CPF)')
    print('   - Botões para alternar entre as planilhas')

if __name__ == '__main__':
    gerar_visualizador_final()
