import openpyxl
import json
from collections import defaultdict

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)

print("=" * 80)
print("COMPARACAO: PLANILHA CONTROLE vs BANCO DE DADOS (NEON)")
print("=" * 80)

# ============================================================
# 1. BASE PREST - Comparar contagem e IDs de despesas
# ============================================================
print("\n" + "=" * 80)
print("1. BASE PREST (Planilha) vs prestacao_expenses (Banco)")
print("=" * 80)

ws = wb['BASE PREST ']
headers = []
for row in ws.iter_rows(min_row=3, max_row=3, values_only=True):
    headers = [str(c).strip() if c else '' for c in row]
print(f"Headers: {headers[:20]}")

prest_ids = set()
prest_rows = 0
for row in ws.iter_rows(min_row=4, values_only=True):
    if row[0] is not None:
        prest_ids.add(str(row[0]))
        prest_rows += 1

print(f"Total rows in BASE PREST: {prest_rows}")
print(f"Unique expense IDs in BASE PREST: {len(prest_ids)}")
sample_ids = list(prest_ids)[:10]
print(f"Sample IDs: {sample_ids}")

# ============================================================
# 2. EXTRATO - Comparar totais
# ============================================================
print("\n" + "=" * 80)
print("2. EXTRATO (Planilha) vs extrato_movimentacao (Banco)")
print("=" * 80)

ws_ext = wb['EXTRATO']
ext_rows = 0
ext_tipos = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for i, row in enumerate(ws_ext.iter_rows(min_row=3, max_row=10, values_only=True)):
    print(f"  Row {i+3}: {[str(c)[:30] if c is not None else '' for c in row[:13]]}")

# ============================================================
# 3. QUINZENAS - Comparar totais por quinzena
# ============================================================
print("\n" + "=" * 80)
print("3. QUINZENAS (Planilha) - Resumo")
print("=" * 80)

ws_qz = wb['QUINZENAS']
qz_data = []
for row in ws_qz.iter_rows(min_row=5, values_only=True):
    if row[0] is not None:
        qz_data.append({
            'colaborador': row[0],
            'cpf': row[1],
            'valor': row[2],
            'quinzena': row[3],
            'mes': row[5],
            'ano': row[6],
        })

print(f"Total quinzena rows: {len(qz_data)}")
aug_qz = [r for r in qz_data if r['ano'] == 2026 and r['mes'] and 'AGO' in str(r['mes']).upper()]
print(f"August 2026 rows: {len(aug_qz)}")
q1 = [r for r in aug_qz if r['quinzena'] and '1' in str(r['quinzena'])]
q2 = [r for r in aug_qz if r['quinzena'] and '2' in str(r['quinzena'])]
print(f"  1QZ Agosto: {len(q1)} rows, total = {sum(r['valor'] or 0 for r in q1):.2f}")
print(f"  2QZ Agosto: {len(q2)} rows, total = {sum(r['valor'] or 0 for r in q2):.2f}")

# ============================================================
# 4. PAINEL PRESTACOES - Resumo
# ============================================================
print("\n" + "=" * 80)
print("4. PAINEL PRESTACOES (Planilha) - Resumo")
print("=" * 80)

ws_pp = wb['PAINEL PRESTAÇÕES']
pp_data = []
for row in ws_pp.iter_rows(min_row=4, values_only=True):
    if row[6] is not None:
        pp_data.append({'nome': row[6], 'valor': row[7]})
print(f"Total pessoas no Painel Prestacoes: {len(pp_data)}")
print(f"Soma total: {sum(r['valor'] or 0 for r in pp_data):.2f}")
for r in sorted(pp_data, key=lambda x: x['valor'] or 0, reverse=True)[:5]:
    print(f"  {r['nome']}: {r['valor']:.2f}")

# Save summary
summary = {
    'base_prest': {'total_rows': prest_rows, 'unique_ids': len(prest_ids), 'sample_ids': sample_ids},
    'quinzenas': {
        'total_rows': len(qz_data),
        'aug_q1_rows': len(q1), 'aug_q1_total': sum(r['valor'] or 0 for r in q1),
        'aug_q2_rows': len(q2), 'aug_q2_total': sum(r['valor'] or 0 for r in q2),
    },
    'painel_prestacoes': {'total_pessoas': len(pp_data), 'soma_total': sum(r['valor'] or 0 for r in pp_data)},
}
with open('controle_summary.json', 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print("\n\nResumo salvo em controle_summary.json")
