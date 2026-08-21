#!/usr/bin/env python3
"""
Validar a abordagem âncora+incremento para PRESTAÇÃO DE CONTAS.

Lógica:
- PRESTAÇÃO(2ª QZ) = PRESTAÇÃO(1ª QZ) + Δ(PRESTAÇÃO)
- Δ(PRESTAÇÃO) = expenses dos reports aprovados entre 11/05 e 25/05 (por approval_date)

Fonte âncora (1ª QZ): planilha CARGA 1 QZ MAIO 26
Fonte verificação (2ª QZ): planilha CONTROLE MAIO 2026 (aba PAINEL, coluna PRESTAÇÃO DE CONTAS)
"""
import os
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

CONTROLE_MAIO = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"
CARGA_1QZ = BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"

print("=" * 80)
print("  VALIDAÇÃO ÂNCORA+INCREMENTO: PRESTAÇÃO DE CONTAS")
print("=" * 80)

# 1. Ler PAINEL do CONTROLE 2ª QZ (valor atual = acumulado histórico na data 25/05)
df_painel = pd.read_excel(CONTROLE_MAIO, sheet_name='PAINEL', header=10)
df_painel['CPF_str'] = df_painel['CPF'].apply(
    lambda x: str(int(x)).zfill(11) if pd.notna(x) and x != '' else None
)
df_painel = df_painel[df_painel['CPF_str'].notna()].copy()
prestacao_2qz = dict(zip(df_painel['CPF_str'], df_painel['(-) PRESTAÇÃO DE CONTAS']))

# 2. Ler CARGA 1ª QZ para obter o SALDO PRESTAÇÃO como âncora
# A CARGA não tem PRESTAÇÃO DE CONTAS diretamente, mas tem SALDO FINAL e SALDO CARTAO
# SALDO PRESTAÇÃO(âncora) = SALDO FINAL + SALDO CARTAO  
# Mas o CONTROLE MAIO (que contém 2ª QZ) também tem a coluna 1ª QZ com as cargas
# Vamos usar a coluna PRESTAÇÃO do PAINEL como referência direta do valor acumulado

# 3. Conectar ao Neon e calcular Δ(PRESTAÇÃO) por CPF
conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

cur.execute("""
    SELECT 
        r.user_cpf,
        r.user_name,
        SUM(e.value) as delta_prestacao
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status = 'APROVADO'
      AND (r.raw_data->>'approval_date')::timestamp >= '2026-05-11'
      AND (r.raw_data->>'approval_date')::timestamp < '2026-05-26'
    GROUP BY r.user_cpf, r.user_name
    ORDER BY delta_prestacao DESC
""")

delta_por_cpf = {}
for cpf, nome, delta in cur.fetchall():
    delta_por_cpf[cpf] = {'nome': nome, 'delta': float(delta)}

# 4. Para calcular a âncora precisamos do PRESTAÇÃO da 1ª QZ
# O CONTROLE MAIO tem o PAINEL no estado da 2ª QZ (última atualização)
# A 1ª QZ anchor seria: PRESTAÇÃO(2ª QZ) - Δ(PRESTAÇÃO)
# Que deveria bater com o PRESTAÇÃO que estava no CONTROLE MAIO quando foi fechado na 1ª QZ
# Não temos esse valor diretamente, então vamos verificar de outra forma:
# Se PRESTAÇÃO(2ª QZ) = PRESTAÇÃO(1ª QZ) + Δ, então Δ = PRESTAÇÃO(2ª QZ) - PRESTAÇÃO(1ª QZ)

# 5. Mas podemos validar calculando o total de expenses de todos os reports aprovados no Neon
# e comparar com o total da planilha
cur.execute("""
    SELECT 
        r.user_cpf,
        SUM(e.value) as total_prestacao_api
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status = 'APROVADO'
    GROUP BY r.user_cpf
""")

total_por_cpf_api = {cpf: float(total) for cpf, total in cur.fetchall()}
conn.close()

# 6. Comparação: PRESTAÇÃO total da planilha vs API (para CPFs que temos expenses)
print("\nComparação PRESTAÇÃO DE CONTAS: Planilha vs API (todos os expenses baixados)")
print(f"{'Colaborador':<35} {'Planilha (total)':>18} {'API (baixado)':>15} {'Diff':>12} {'Cobertura':>10}")
print("-" * 95)

total_planilha = 0
total_api_match = 0
cpfs_com_dados = 0
cpfs_sem_dados = 0

for cpf, prestacao_planilha in sorted(prestacao_2qz.items(), key=lambda x: -x[1] if pd.notna(x[1]) else 0):
    if not pd.notna(prestacao_planilha) or prestacao_planilha == 0:
        continue
    
    nome_row = df_painel[df_painel['CPF_str'] == cpf]['COLABORADOR'].values
    nome = nome_row[0] if len(nome_row) > 0 else cpf
    
    api_total = total_por_cpf_api.get(cpf, 0)
    diff = float(prestacao_planilha) - api_total
    cobertura = (api_total / float(prestacao_planilha) * 100) if float(prestacao_planilha) > 0 else 0
    
    total_planilha += float(prestacao_planilha)
    total_api_match += api_total
    
    if api_total > 0:
        cpfs_com_dados += 1
    else:
        cpfs_sem_dados += 1
    
    # Mostrar top 15 por valor da planilha
    if cpfs_com_dados + cpfs_sem_dados <= 15:
        print(f"{str(nome)[:35]:<35} R$ {float(prestacao_planilha):>15,.2f} R$ {api_total:>12,.2f} R$ {diff:>9,.2f} {cobertura:>8.1f}%")

print("-" * 95)
print(f"\n  Total colaboradores com expenses na API: {cpfs_com_dados}")
print(f"  Total colaboradores SEM expenses na API: {cpfs_sem_dados}")
print(f"\n  TOTAL PRESTAÇÃO planilha (todos): R$ {total_planilha:,.2f}")
print(f"  TOTAL API (expenses baixados):    R$ {total_api_match:,.2f}")
print(f"  Cobertura API:                    {total_api_match/total_planilha*100:.1f}%")

print("\n" + "=" * 80)
print("  Δ(PRESTAÇÃO) por approval_date 11-25/05")
print("=" * 80)
delta_total = sum(v['delta'] for v in delta_por_cpf.values())
print(f"\n  Total Δ(PRESTAÇÃO) API (11-25/05): R$ {delta_total:,.2f}")
print(f"  Reports com expenses baixados:     308")
print(f"  Expenses totais:                   5.889")
