import json

with open('painel_planilha.json', 'r', encoding='utf-8') as f:
    planilha = json.load(f)

planilha_data = planilha['data']

# Bank data for specific CPFs (from SQL queries)
# ABNER: carga=280393.66, transf=61887.90, tarifa=1561, prest=218431, saldo=-1486.24
# Planilha ABNER: carga=280393.66, transf=-61887.90, tarifa=-1589, prest=218431, saldo=-1514.24

# Compare specific people
comparisons = [
    ('02027745203', 'ABNER', {'carga': 280393.66, 'transf': 61887.90, 'tarifa': 1561, 'prest': 218431, 'saldo': -1486.24}),
    ('01932662537', 'ADAN', {'carga': 10382.39, 'transf': 612, 'tarifa': 56, 'prest': 9302.81, 'saldo': 411.58}),
    ('85087572634', 'ADAUTO', {'carga': 2343.99, 'transf': 302.12, 'tarifa': 42, 'prest': 1526.24, 'saldo': 473.63}),
    ('06223031980', 'ADEMARCIO', {'carga': 32681.36, 'transf': 6631.41, 'tarifa': 98, 'prest': 27060.49, 'saldo': -1108.54}),
    ('60843403004', 'ADILSON', {'carga': 5928.00, 'transf': 90, 'tarifa': 65.19, 'prest': 1280, 'saldo': 4492.81}),
]

print("=" * 100)
print("COMPARACAO INDIVIDUAL: Planilha vs Banco (Q2 Agosto 2026)")
print("=" * 100)
print(f"{'CPF':<15} {'Nome':<12} {'Campo':<12} {'Planilha':>15} {'Banco':>15} {'Diff':>15}")
print("-" * 100)

for cpf, nome, bank in comparisons:
    p = planilha_data.get(cpf)
    if not p:
        print(f"{cpf:<15} {nome:<12} NAO ENCONTRADO NA PLANILHA")
        continue
    
    for field, b_val in bank.items():
        p_val = p[field] if field in p else p.get(field.replace('transf', 'transferencia'), 0)
        if field == 'transf':
            p_val = abs(p['transferencia'])
        elif field == 'tarifa':
            p_val = abs(p['tarifa'])
        elif field == 'prest':
            p_val = p['prestacao']
        elif field == 'saldo':
            p_val = p['saldo']
        elif field == 'carga':
            p_val = p['carga']
        
        diff = b_val - p_val
        match = 'OK' if abs(diff) < 0.01 else 'DIFF'
        print(f"{cpf:<15} {nome:<12} {field:<12} {p_val:>15.2f} {b_val:>15.2f} {diff:>15.2f}  {match}")
    print()

# Now check: the planilha PAINEL has 771 pessoas, bank has 799
# Find CPFs in bank not in planilha
print("\n--- CPFs no banco mas nao na planilha ---")
# We need the full bank CPF list - let's note the difference
print(f"Planilha: {len(planilha_data)} CPFs")
print(f"Banco: 799 CPFs")
print(f"Diferenca: {799 - len(planilha_data)} CPFs extras no banco")

# Check if planilha has CPFs not in bank
# (would need full bank CPF list for this)
