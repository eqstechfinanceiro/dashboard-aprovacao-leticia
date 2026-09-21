import openpyxl
import json
from collections import defaultdict

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)

print("=" * 80)
print("COMPARACAO DETALHADA: PLANILHA vs BANCO")
print("=" * 80)

# ============================================================
# 1. EXTRATO - Totais por tipo (planilha)
# ============================================================
print("\n--- EXTRATO (Planilha) ---")
ws_ext = wb['EXTRATO']

# Row 3-5 has summary, row 8 has headers, row 9+ has data
# Headers: ANO, MES, Data, Hora, Cod Transacao, Num Cartao, Grupo, Usuario, Tipo, Descricao, Valor, CPF
ext_tipos = defaultdict(lambda: {'count': 0, 'sum': 0.0})
ext_total = 0
ext_count = 0

for row in ws_ext.iter_rows(min_row=9, values_only=True):
    if row[1] is None and row[8] is None:
        continue
    tipo = str(row[8]).strip() if row[8] else 'NULL'
    valor = float(row[11]) if row[11] else 0.0
    ext_tipos[tipo]['count'] += 1
    ext_tipos[tipo]['sum'] += valor
    ext_total += valor
    ext_count += 1

print(f"Total rows: {ext_count}")
for tipo in sorted(ext_tipos.keys()):
    t = ext_tipos[tipo]
    print(f"  {tipo}: count={t['count']}, sum={t['sum']:.2f}")
print(f"  TOTAL: {ext_total:.2f}")

# Summary from row 3-5
print("\nSummary rows (top of sheet):")
for i, row in enumerate(ws_ext.iter_rows(min_row=3, max_row=5, values_only=True)):
    if row[1]:
        print(f"  {row[1]}: count={row[2]}, sum={row[3]}")

# ============================================================
# 2. QUINZENAS - Detalhe por pessoa para Agosto
# ============================================================
print("\n--- QUINZENAS (Planilha) - Agosto 2026 ---")
ws_qz = wb['QUINZENAS']
qz_aug = []
for row in ws_qz.iter_rows(min_row=5, values_only=True):
    if row[0] is None:
        continue
    ano = row[6]
    mes = str(row[5]).upper() if row[5] else ''
    if ano == 2026 and 'AGO' in mes:
        qz_aug.append({
            'colaborador': str(row[0]).strip(),
            'cpf': str(row[1]).strip() if row[1] else '',
            'valor': float(row[2]) if row[2] else 0.0,
            'quinzena': str(row[3]).strip() if row[3] else '',
        })

q1 = [r for r in qz_aug if '1' in r['quinzena']]
q2 = [r for r in qz_aug if '2' in r['quinzena']]
print(f"1QZ Agosto: {len(q1)} rows, soma={sum(r['valor'] for r in q1):.2f}")
print(f"2QZ Agosto: {len(q2)} rows, soma={sum(r['valor'] for r in q2):.2f}")

# Group by CPF for comparison
q1_by_cpf = {r['cpf']: r['valor'] for r in q1 if r['cpf']}
q2_by_cpf = {r['cpf']: r['valor'] for r in q2 if r['cpf']}

# ============================================================
# 3. PAINEL - Estrutura (colunas principais)
# ============================================================
print("\n--- PAINEL (Planilha) - Headers ---")
ws_painel = wb['PAINEL']
# Find header row
for i, row in enumerate(ws_painel.iter_rows(min_row=1, max_row=15, values_only=True)):
    vals = [(j, str(c)[:25]) for j, c in enumerate(row[:30]) if c is not None]
    if vals:
        print(f"  Row {i+1}: {vals[:15]}")

# ============================================================
# 4. BASE PREST - Count by status
# ============================================================
print("\n--- BASE PREST (Planilha) - Por status ---")
ws_bp = wb['BASE PREST ']
status_counts = defaultdict(int)
for row in ws_bp.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    status = str(row[10]).strip() if row[10] else 'NULL'
    status_counts[status] += 1

for s in sorted(status_counts.keys()):
    print(f"  {s}: {status_counts[s]}")
print(f"  TOTAL: {sum(status_counts.values())}")

# ============================================================
# 5. PAINEL PRESTACOES - Detalhe
# ============================================================
print("\n--- PAINEL PRESTACOES (Planilha) ---")
ws_pp = wb['PAINEL PRESTAÇÕES']
pp_data = []
for row in ws_pp.iter_rows(min_row=4, values_only=True):
    if row[6] is not None:
        pp_data.append({'nome': str(row[6]).strip(), 'valor': float(row[7]) if row[7] else 0.0})
print(f"Total pessoas: {len(pp_data)}")
print(f"Soma total: {sum(r['valor'] for r in pp_data):.2f}")

# Save comparison data
with open('controle_comparison.json', 'w', encoding='utf-8') as f:
    json.dump({
        'extrato_planilha': {k: v for k, v in ext_tipos.items()},
        'extrato_planilha_total': ext_total,
        'extrato_planilha_count': ext_count,
        'quinzenas_q1': {'rows': len(q1), 'total': sum(r['valor'] for r in q1)},
        'quinzenas_q2': {'rows': len(q2), 'total': sum(r['valor'] for r in q2)},
        'base_prest_status': dict(status_counts),
        'painel_prestacoes': {'pessoas': len(pp_data), 'soma': sum(r['valor'] for r in pp_data)},
    }, f, ensure_ascii=False, indent=2, default=str)
print("\nDados salvos em controle_comparison.json")
