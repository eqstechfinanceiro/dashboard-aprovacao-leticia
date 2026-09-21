import json

# Load planilha data
with open('painel_planilha.json', 'r', encoding='utf-8') as f:
    planilha = json.load(f)

# Load bank data (saved from SQL query)
# We'll compare totals first
planilha_totals = planilha['totals']
planilha_data = planilha['data']

print("=" * 80)
print("COMPARACAO: PAINEL PLANILHA vs BANCO (Q2 Agosto 2026)")
print("=" * 80)

# Bank totals (from SQL query)
bank_totals = {
    'carga': 9227917.45,
    'transferencia': 1342459.72,
    'tarifa': 60650.80,
    'prestacao': 7358051.39,
    'saldo_final': 327538.79,
}

print("\n--- TOTAIS ---")
print(f"{'Campo':<20} {'Planilha':>15} {'Banco':>15} {'Diff':>15}")
print("-" * 65)
for key in ['carga', 'transferencia', 'tarifa', 'prestacao', 'saldo_final']:
    p_key = 'saldo' if key == 'saldo_final' else key
    p = planilha_totals[p_key]
    b = bank_totals[key]
    # Note: planilha transferencia and tarifa are negative, bank stores them positive
    if key in ['transferencia', 'tarifa']:
        p_abs = abs(p)
        diff = b - p_abs
        print(f"{key:<20} {p_abs:>15.2f} {b:>15.2f} {diff:>15.2f}")
    else:
        diff = b - p
        print(f"{key:<20} {p:>15.2f} {b:>15.2f} {diff:>15.2f}")

print(f"\n{'Pessoas':<20} {len(planilha_data):>15} {'799':>15}")

# The planilha has 771 pessoas, bank has 799 frozen rows
# Difference of 28 - likely inactive/desativado users not in planilha PAINEL

print("\n--- ANALISE ---")
print(f"Planilha PAINEL: {len(planilha_data)} pessoas")
print(f"Banco Q2 frozen: 799 linhas")
print(f"Diferenca: {799 - len(planilha_data)} pessoas (provavelmente inativos/desativados)")

# Carga comparison
p_carga = planilha_totals['carga']
b_carga = bank_totals['carga']
print(f"\nCarga: Planilha={p_carga:.2f}, Banco={b_carga:.2f}, Diff={b_carga - p_carga:.2f}")

# Transferencia (planilha is negative, bank is positive)
p_transf = abs(planilha_totals['transferencia'])
b_transf = bank_totals['transferencia']
print(f"Transferencia: Planilha={p_transf:.2f}, Banco={b_transf:.2f}, Diff={b_transf - p_transf:.2f}")

# Tarifa (planilha is negative, bank is positive)
p_tarifa = abs(planilha_totals['tarifa'])
b_tarifa = bank_totals['tarifa']
print(f"Tarifa: Planilha={p_tarifa:.2f}, Banco={b_tarifa:.2f}, Diff={b_tarifa - p_tarifa:.2f}")

# Prestacao
p_prest = planilha_totals['prestacao']
b_prest = bank_totals['prestacao']
print(f"Prestacao: Planilha={p_prest:.2f}, Banco={b_prest:.2f}, Diff={b_prest - p_prest:.2f}")

# Saldo
p_saldo = planilha_totals['saldo']
b_saldo = bank_totals['saldo_final']
print(f"Saldo Final: Planilha={p_saldo:.2f}, Banco={b_saldo:.2f}, Diff={b_saldo - p_saldo:.2f}")

# Expected: saldo = carga - transferencia - tarifa - prestacao
expected_saldo_planilha = p_carga - p_transf - p_tarifa - p_prest
print(f"\nSaldo esperado (planilha): {expected_saldo_planilha:.2f} vs real: {p_saldo:.2f}")
expected_saldo_bank = b_carga - b_transf - b_tarifa - b_prest
print(f"Saldo esperado (banco): {expected_saldo_bank:.2f} vs real: {b_saldo:.2f}")
