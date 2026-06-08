import json

def analisar_jonas_completo():
    """Analisar todas as colunas da linha do JONAS na planilha"""
    
    print('📋 ANÁLISE COMPLETA DA LINHA DO JONAS')
    print('=' * 60)
    
    # Carregar dados da planilha
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        dados = json.load(f)
    
    planilha = dados['Planilha1']
    
    # Encontrar linha do JONAS
    linha_jonas = None
    indice_jonas = None
    
    for i, linha in enumerate(planilha):
        if linha and len(linha) > 0 and 'JONAS CAVALCANTI' in str(linha[0]):
            linha_jonas = linha
            indice_jonas = i
            break
    
    if not linha_jonas:
        print('❌ JONAS não encontrado na planilha')
        return
    
    print(f'✅ JONAS encontrado na linha {indice_jonas + 1}')
    print()
    
    # Definir nomes das colunas baseado na estrutura que vimos
    colunas = [
        'Colaborador', 'CPF', 'Status', 'Regional', 'Centro de Custo',
        'Gestor 1', 'Gestor 2', 'Campo 8', 'Valor Total', '1ª QZ',
        'Percentual', 'Campo 12', 'Campo 13', 'Campo 14', 'Campo 15',
        'Campo 16', 'Status Cartão'
    ]
    
    print('📊 DADOS COMPLETOS DO JONAS:')
    print('-' * 60)
    
    dados_jonas = {}
    for i, (coluna, valor) in enumerate(zip(colunas, linha_jonas)):
        if i < len(linha_jonas):
            dados_jonas[coluna] = valor
            print(f'{coluna:20}: "{valor}"')
    
    # Salvar dados completos
    with open('jonas_dados_completos.json', 'w', encoding='utf-8') as f:
        json.dump(dados_jonas, f, ensure_ascii=False, indent=2)
    
    print()
    print('💾 Dados salvos em jonas_dados_completos.json')
    
    return dados_jonas

if __name__ == '__main__':
    analisar_jonas_completo()
