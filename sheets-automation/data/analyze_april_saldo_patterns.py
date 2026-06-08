import json
from datetime import datetime
import sys

# Carregar dados da planilha de quinzena
print("Carregando dados...")
try:
    with open('../vexpenses-dashboard/planilha-1qz-data.json', 'r', encoding='utf-8') as f:
        data_list = json.load(f)
    print("Dados carregados com sucesso!")
    print(f"Tipo de dados: {type(data_list)}")
    print(f"Total de entradas: {len(data_list)}")
except Exception as e:
    print(f"Erro ao carregar dados: {e}")
    sys.exit(1)

print("="*80)
print("ANÁLISE DE PADRÕES DE SALDO - ABRIL 2026")
print("="*80)
print("Iniciando processamento...")

# Estatísticas gerais
print(f"\nTotal de usuários: {len(data_list)}")

# Análise de saldos - apenas primeiros 50 usuários para速度
saldo_final_values = []
saldo_cartao_values = []
saldo_reembolsar_values = []
qz1_values = []
adiantamento_values = []

users_with_saldo_final = []
users_with_saldo_cartao = []
users_with_saldo_reembolsar = []

print("\nProcessando primeiros 50 usuários para análise rápida...")
print(f"Total de entradas no dataset: {len(data_list)}")
for i, entry in enumerate(data_list[:50]):
    if i % 10 == 0:
        print(f"Processando usuário {i}...")
    
    # A entrada já é o sheet
    sheet = entry
    
    # Coletar valores
    saldo_final = sheet.get('saldoFinal')
    saldo_cartao = sheet.get('saldoCartao')
    saldo_reembolsar = sheet.get('saldoReembolsar')
    qz1 = sheet.get('qz1')
    adiantamento = sheet.get('adiantamento')
    portador = sheet.get('portador', 'N/A')
    cpf = sheet.get('cpf', 'N/A')
    
    if saldo_final is not None:
        saldo_final_values.append(saldo_final)
        users_with_saldo_final.append({
            'cpf': cpf,
            'portador': portador,
            'saldoFinal': saldo_final,
            'saldoCartao': saldo_cartao,
            'qz1': qz1,
            'adiantamento': adiantamento
        })
    
    if saldo_cartao is not None:
        saldo_cartao_values.append(saldo_cartao)
        users_with_saldo_cartao.append({
            'cpf': cpf,
            'portador': portador,
            'saldoCartao': saldo_cartao,
            'qz1': qz1
        })
    
    if saldo_reembolsar is not None:
        saldo_reembolsar_values.append(saldo_reembolsar)
        users_with_saldo_reembolsar.append({
            'cpf': cpf,
            'portador': portador,
            'saldoReembolsar': saldo_reembolsar,
            'saldoFinal': saldo_final,
            'saldoCartao': saldo_cartao
        })
    
    if qz1 is not None:
        qz1_values.append(qz1)
    
    if adiantamento is not None:
        adiantamento_values.append(adiantamento)

print("\nProcessamento concluído!")
print(f"Usuários processados: {len(users_with_saldo_final)}")

print("\n" + "="*80)
print("ESTATÍSTICAS DOS SALDOS")
print("="*80)

print(f"\nSALDO FINAL:")
print(f"  Usuários com dado: {len(saldo_final_values)}")
if saldo_final_values:
    print(f"  Mínimo: R$ {min(saldo_final_values):.2f}")
    print(f"  Máximo: R$ {max(saldo_final_values):.2f}")
    print(f"  Média: R$ {sum(saldo_final_values)/len(saldo_final_values):.2f}")
    print(f"  Mediana: R$ {sorted(saldo_final_values)[len(saldo_final_values)//2]:.2f}")

print(f"\nSALDO CARTÃO:")
print(f"  Usuários com dado: {len(saldo_cartao_values)}")
if saldo_cartao_values:
    print(f"  Mínimo: R$ {min(saldo_cartao_values):.2f}")
    print(f"  Máximo: R$ {max(saldo_cartao_values):.2f}")
    print(f"  Média: R$ {sum(saldo_cartao_values)/len(saldo_cartao_values):.2f}")
    print(f"  Mediana: R$ {sorted(saldo_cartao_values)[len(saldo_cartao_values)//2]:.2f}")

print(f"\nSALDO REEMBOLSAR:")
print(f"  Usuários com dado: {len(saldo_reembolsar_values)}")
if saldo_reembolsar_values:
    print(f"  Mínimo: R$ {min(saldo_reembolsar_values):.2f}")
    print(f"  Máximo: R$ {max(saldo_reembolsar_values):.2f}")
    print(f"  Média: R$ {sum(saldo_reembolsar_values)/len(saldo_reembolsar_values):.2f}")
    print(f"  Mediana: R$ {sorted(saldo_reembolsar_values)[len(saldo_reembolsar_values)//2]:.2f}")

print(f"\n1QZ (QUINZENA):")
print(f"  Usuários com dado: {len(qz1_values)}")
if qz1_values:
    print(f"  Mínimo: R$ {min(qz1_values):.2f}")
    print(f"  Máximo: R$ {max(qz1_values):.2f}")
    print(f"  Média: R$ {sum(qz1_values)/len(qz1_values):.2f}")
    print(f"  Mediana: R$ {sorted(qz1_values)[len(qz1_values)//2]:.2f}")

print(f"\nADIANTAMENTO:")
print(f"  Usuários com dado: {len(adiantamento_values)}")
if adiantamento_values:
    print(f"  Mínimo: R$ {min(adiantamento_values):.2f}")
    print(f"  Máximo: R$ {max(adiantamento_values):.2f}")
    print(f"  Média: R$ {sum(adiantamento_values)/len(adiantamento_values):.2f}")

# Análise de correlações
print("\n" + "="*80)
print("ANÁLISE DE CORRELAÇÕES")
print("="*80)

# Correlação SALDO FINAL vs QZ1
correlation_data = []
for entry in data_list[:100]:
    saldo_final = entry.get('saldoFinal')
    qz1 = entry.get('qz1')
    if saldo_final is not None and qz1 is not None:
        correlation_data.append({
            'saldoFinal': saldo_final,
            'qz1': qz1
        })

if correlation_data:
    # Calcular correlação manualmente
    n = len(correlation_data)
    if n > 1:
        sum_x = sum(item['saldoFinal'] for item in correlation_data)
        sum_y = sum(item['qz1'] for item in correlation_data)
        sum_xy = sum(item['saldoFinal'] * item['qz1'] for item in correlation_data)
        sum_x2 = sum(item['saldoFinal'] ** 2 for item in correlation_data)
        sum_y2 = sum(item['qz1'] ** 2 for item in correlation_data)
        
        numerator = n * sum_xy - sum_x * sum_y
        denominator = ((n * sum_x2 - sum_x ** 2) * (n * sum_y2 - sum_y ** 2)) ** 0.5
        
        correlation = numerator / denominator if denominator != 0 else 0
        print(f"\nCorrelação SALDO FINAL vs QZ1: {correlation:.4f}")
    
    # Mostrar exemplos
    print("\nExemplos de usuários com SALDO FINAL e QZ1:")
    for i, user in enumerate(users_with_saldo_final[:10]):
        print(f"  {user['portador']}: SALDO FINAL=R$ {user['saldoFinal']:.2f}, QZ1=R$ {user['qz1']:.2f}, Ratio={user['saldoFinal']/user['qz1'] if user['qz1'] > 0 else 0:.4f}")

# Correlação SALDO CARTÃO vs QZ1
correlation_data_cartao = []
for entry in data_list[:100]:
    saldo_cartao = entry.get('saldoCartao')
    qz1 = entry.get('qz1')
    if saldo_cartao is not None and qz1 is not None:
        correlation_data_cartao.append({
            'saldoCartao': saldo_cartao,
            'qz1': qz1
        })

if correlation_data_cartao:
    # Calcular correlação manualmente
    n = len(correlation_data_cartao)
    if n > 1:
        sum_x = sum(item['saldoCartao'] for item in correlation_data_cartao)
        sum_y = sum(item['qz1'] for item in correlation_data_cartao)
        sum_xy = sum(item['saldoCartao'] * item['qz1'] for item in correlation_data_cartao)
        sum_x2 = sum(item['saldoCartao'] ** 2 for item in correlation_data_cartao)
        sum_y2 = sum(item['qz1'] ** 2 for item in correlation_data_cartao)
        
        numerator = n * sum_xy - sum_x * sum_y
        denominator = ((n * sum_x2 - sum_x ** 2) * (n * sum_y2 - sum_y ** 2)) ** 0.5
        
        correlation = numerator / denominator if denominator != 0 else 0
        print(f"\nCorrelação SALDO CARTÃO vs QZ1: {correlation:.4f}")
    
    # Mostrar exemplos
    print("\nExemplos de usuários com SALDO CARTÃO e QZ1:")
    for i, user in enumerate(users_with_saldo_cartao[:10]):
        print(f"  {user['portador']}: SALDO CARTÃO=R$ {user['saldoCartao']:.2f}, QZ1=R$ {user['qz1']:.2f}, Ratio={user['saldoCartao']/user['qz1'] if user['qz1'] > 0 else 0:.4f}")

# Análise de usuários com basePrest (extrato)
print("\n" + "="*80)
print("ANÁLISE DE USUÁRIOS COM EXTRATO (BASE PREST)")
print("="*80)

users_with_extrato = []
for i, entry in enumerate(data_list[:50]):
    # Verificar se tem dados de extrato (basePrest)
    # Como não temos essa estrutura no arquivo simplificado, vamos pular por enquanto
    pass

print(f"\nUsuários com extrato (primeiros 50): {len(users_with_extrato)}")

if users_with_extrato:
    print("\nExemplos de usuários com extrato:")
    for i, user in enumerate(users_with_extrato[:10]):
        sheet = user['sheet']
        print(f"\n  {user['portador']}:")
        print(f"    Base Prest Total: R$ {user['basePrestTotal']:.2f}")
        print(f"    Base Prest Reembolsável: R$ {user['basePrestReembolsavel']:.2f}")
        print(f"    Base Prest Cartão: R$ {user['basePrestCartao']:.2f}")
        print(f"    SALDO FINAL: R$ {sheet.get('saldoFinal', 'N/A')}")
        print(f"    SALDO CARTÃO: R$ {sheet.get('saldoCartao', 'N/A')}")
        print(f"    QZ1: R$ {sheet.get('qz1', 'N/A')}")
        
        # Calcular correlações
        if sheet.get('saldoFinal') is not None:
            ratio = sheet.get('saldoFinal') / user['basePrestTotal'] if user['basePrestTotal'] > 0 else 0
            print(f"    Ratio SALDO FINAL / Base Prest: {ratio:.4f}")

# Salvar análise simplificada
output = {
    'analysis_date': datetime.now().isoformat(),
    'sample_size': 50,
    'statistics': {
        'total_users': len(data_list),
        'users_with_saldo_final': len(saldo_final_values),
        'users_with_saldo_cartao': len(saldo_cartao_values),
        'users_with_saldo_reembolsar': len(saldo_reembolsar_values),
        'users_with_qz1': len(qz1_values),
        'users_with_adiantamento': len(adiantamento_values),
        'users_with_extrato': len(users_with_extrato)
    },
    'saldo_final_stats': {
        'count': len(saldo_final_values),
        'min': min(saldo_final_values) if saldo_final_values else None,
        'max': max(saldo_final_values) if saldo_final_values else None,
        'mean': sum(saldo_final_values)/len(saldo_final_values) if saldo_final_values else None
    },
    'saldo_cartao_stats': {
        'count': len(saldo_cartao_values),
        'min': min(saldo_cartao_values) if saldo_cartao_values else None,
        'max': max(saldo_cartao_values) if saldo_cartao_values else None,
        'mean': sum(saldo_cartao_values)/len(saldo_cartao_values) if saldo_cartao_values else None
    },
    'sample_users_with_extrato': users_with_extrato[:10]
}

with open('../investigation-docs/april_saldo_patterns_analysis.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("\n" + "="*80)
print("Análise salva em investigation-docs/april_saldo_patterns_analysis.json")
print("="*80)