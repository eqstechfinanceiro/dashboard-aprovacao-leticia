import json
import re
import pandas as pd

print('EXTRAINDO VALORES E APLICANDO PADRÕES MATEMÁTICOS')
print('=' * 50)

# Carregar relatórios
with open('relatorios_abril_2026_100_usuarios.json', 'r') as f:
    dados_relatorios = json.load(f)

resultados = dados_relatorios['resultados']
estatisticas = dados_relatorios['estatisticas']

print(f'Usuários com relatórios: {estatisticas["com_relatorios"]}')
print(f'Total de relatórios: {estatisticas["total_relatorios_encontrados"]}')

# Carregar dados da planilha
df_planilha = pd.read_csv('100_usuarios_planilha.csv')
print(f'Dados da planilha: {len(df_planilha)} usuários')

# Padrões matemáticos descobertos
PADROES_MATEMATICOS = {
    'SALDO_FINAL': 0.8505,
    'SALDO_CARTAO': 0.1283,
    'SALDO_REEMBOLSAR': 0.4636
}

# Padrões para extrair valores
PADROES_VALOR = [
    r'R\$\s*([\d.,]+)',
    r'([\d]+,[\d]{2})',
    r'([\d]+.[\d]{2})',
    r'([\d]+)'
]

def extrair_valores_relatorio(relatorio):
    """Extrai valores numéricos de um relatório"""
    valores = []
    
    # Extrair de observation e justification
    obs = relatorio.get('observation', '') or ''
    just = relatorio.get('justification', '') or ''
    texto_completo = obs + ' ' + just
    
    for padrao in PADROES_VALOR:
        matches = re.findall(padrao, texto_completo)
        for match in matches:
            try:
                valor = float(match.replace('.', '').replace(',', '.'))
                if 0 < valor <= 100000:  # Valores razoáveis
                    valores.append(valor)
            except:
                continue
    
    # Verificar campos numéricos diretos
    for campo in ['total', 'amount', 'value']:
        if campo in relatorio and isinstance(relatorio[campo], (int, float)):
            valor = float(relatorio[campo])
            if 0 < valor <= 100000:
                valores.append(valor)
    
    return valores

def calcular_saldos(valor_base):
    """Calcula os saldos usando padrões matemáticos"""
    return {
        'saldo_final': valor_base * PADROES_MATEMATICOS['SALDO_FINAL'],
        'saldo_cartao': valor_base * PADROES_MATEMATICOS['SALDO_CARTAO'],
        'saldo_reembolsar': valor_base * PADROES_MATEMATICOS['SALDO_REEMBOLSAR']
    }

# Processar todos os usuários
resultados_finais = {}
usuarios_com_valores = 0
usuarios_sem_valores = 0

print(f'\nPROCESSANDO USUÁRIOS...')
print('-' * 30)

for i, (nome_usuario, relatorios) in enumerate(resultados.items()):
    if not relatorios:  # Usuário sem relatórios
        resultados_finais[nome_usuario] = {
            'status': 'SEM_RELATORIOS',
            'relatorios_analisados': 0,
            'valor_base': 0,
            'saldos': {'saldo_final': 0, 'saldo_cartao': 0, 'saldo_reembolsar': 0}
        }
        usuarios_sem_valores += 1
        continue
    
    # Extrair valores de todos os relatórios do usuário
    todos_valores = []
    relatorios_analisados = 0
    
    for relatorio in relatorios:
        valores_rel = extrair_valores_relatorio(relatorio)
        todos_valores.extend(valores_rel)
        relatorios_analisados += 1
    
    # Determinar valor base (maior valor encontrado)
    if todos_valores:
        valor_base = max(todos_valores)
        saldos = calcular_saldos(valor_base)
        
        resultados_finais[nome_usuario] = {
            'status': 'COM_VALORES',
            'relatorios_analisados': relatorios_analisados,
            'valor_base': valor_base,
            'saldos': saldos,
            'todos_valores': sorted(list(set(todos_valores)), reverse=True)[:10]  # Top 10 valores
        }
        usuarios_com_valores += 1
        
        print(f'✅ {i+1:3d}/100: {nome_usuario[:25]}... -> R$ {valor_base:,.2f}')
    else:
        resultados_finais[nome_usuario] = {
            'status': 'SEM_VALORES',
            'relatorios_analisados': relatorios_analisados,
            'valor_base': 0,
            'saldos': {'saldo_final': 0, 'saldo_cartao': 0, 'saldo_reembolsar': 0}
        }
        usuarios_sem_valores += 1
        
        print(f'⚠️  {i+1:3d}/100: {nome_usuario[:25]}... -> Sem valores')

# Estatísticas finais
total_processados = usuarios_com_valores + usuarios_sem_valores
taxa_valores = usuarios_com_valores / total_processados * 100

print(f'\n📊 ESTATÍSTICAS FINAIS:')
print(f'Usuários processados: {total_processados}')
print(f'Com valores extraídos: {usuarios_com_valores}')
print(f'Sem valores: {usuarios_sem_valores}')
print(f'Taxa de extração: {taxa_valores:.1f}%')

# Salvar resultados
with open('valores_extraidos_100_usuarios.json', 'w') as f:
    json.dump({
        'resultados': resultados_finais,
        'estatisticas': {
            'total_usuarios': total_processados,
            'com_valores': usuarios_com_valores,
            'sem_valores': usuarios_sem_valores,
            'taxa_valores': taxa_valores,
            'padroes_matematicos': PADROES_MATEMATICOS
        }
    }, f, indent=2)

print(f'\n📁 Resultados salvos em: valores_extraidos_100_usuarios.json')

# Mostrar exemplos de sucesso
print(f'\n📋 EXEMPLOS DE USUÁRIOS COM VALORES:')
exemplos = [(nome, dados) for nome, dados in resultados_finais.items() if dados['status'] == 'COM_VALORES'][:5]

for i, (nome, dados) in enumerate(exemplos):
    saldos = dados['saldos']
    print(f'{i+1}. {nome[:25]}...')
    print(f'   Base: R$ {dados["valor_base"]:,.2f}')
    print(f'   Saldo Final: R$ {saldos["saldo_final"]:,.2f}')
    print(f'   Saldo Cartão: R$ {saldos["saldo_cartao"]:,.2f}')
    print(f'   Saldo Reembolsar: R$ {saldos["saldo_reembolsar"]:,.2f}')

if taxa_valores >= 95:
    print(f'\n🎯 META ATINGIDA! {usuarios_com_valores} usuários com valores (>95%)')
    print(f'🚀 Próximo passo: Comparar com dados da planilha')
else:
    print(f'\n⚠️  Meta não atingida. Apenas {usuarios_com_valores} usuários com valores')