import json

def gerar_visualizador_corrigido():
    """Gera o HTML final corrigido com indicadores API e depuração"""
    
    # Carregar dados
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        planilha_data = json.load(f)

    with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
        validation_data = json.load(f)
    
    # Ler template HTML corrigido
    with open('visualizador_corrigido.html', 'r', encoding='utf-8') as f:
        html_template = f.read()
    
    # Substituir placeholders
    html_template = html_template.replace(
        'const planilhaData = /*PLANILHA_DATA*/;',
        f'const planilhaData = {json.dumps(planilha_data, ensure_ascii=False)};'
    )
    
    html_template = html_template.replace(
        'const validationData = /*VALIDATION_DATA*/;',
        f'const validationData = {json.dumps(validation_data, ensure_ascii=False)};'
    )
    
    # Salvar arquivo final
    with open('visualizador_com_indicadores.html', 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print('✅ Visualizador corrigido criado: visualizador_com_indicadores.html')
    print('🔧 Correções aplicadas:')
    print('   - Depuração no console para verificar JONAS')
    print('   - Indicadores API abaixo dos dados validados')
    print('   - Lógica de validação corrigida')
    print('   - JONAS CAVALCANTI deve aparecer verde com indicadores')

if __name__ == '__main__':
    gerar_visualizador_corrigido()
