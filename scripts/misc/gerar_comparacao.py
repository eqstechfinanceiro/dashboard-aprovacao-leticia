import openpyxl
import xlsxwriter
import psycopg2
import json
from collections import defaultdict
from datetime import datetime

# ============================================================
# CONFIG
# ============================================================
PLANILHA_PATH = 'CONTROLE - VEXPENSES - AGOSTO 2026.xlsx'
OUTPUT_PATH = 'COMPARACAO_BANCO_PLANILHA_v3.xlsx'
DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

print("Conectando ao banco...")
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

print("Lendo planilha...")
wb_pl = openpyxl.load_workbook(PLANILHA_PATH, read_only=True, data_only=True)

# ============================================================
# 1. LER DADOS DA PLANILHA
# ============================================================

# 1a. BASE PREST (planilha)
print("  Lendo BASE PREST da planilha...")
ws_bp = wb_pl['BASE PREST ']
planilha_expenses = {}
planilha_expense_status = defaultdict(int)
for row in ws_bp.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    eid = str(row[0])
    planilha_expenses[eid] = {
        'id': eid,
        'report_id': str(row[1]) if row[1] else '',
        'report_name': str(row[2]) if row[2] else '',
        'date': str(row[3]) if row[3] else '',
        'user_name': str(row[4]) if row[4] else '',
        'cpf': str(row[9]) if row[9] else '',
        'status': str(row[10]).strip() if row[10] else '',
        'description': str(row[12]) if row[12] else '',
        'tipo': str(row[13]) if row[13] else '',
        'payment_method': str(row[18]) if row[18] else '',
    }
    planilha_expense_status[planilha_expenses[eid]['status']] += 1

print(f"    Planilha BASE PREST: {len(planilha_expenses)} despesas")
for s, c in sorted(planilha_expense_status.items(), key=lambda x: -x[1]):
    print(f"      {s}: {c}")

# 1b. EXTRATO (planilha)
print("  Lendo EXTRATO da planilha...")
ws_ext = wb_pl['EXTRATO']
planilha_extrato = []
planilha_extrato_tipos = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for row in ws_ext.iter_rows(min_row=9, values_only=True):
    if row[1] is None and row[9] is None:
        continue
    tipo = str(row[9]).strip() if row[9] else 'NULL'
    valor = float(row[11]) if row[11] else 0.0
    planilha_extrato.append({
        'ano': row[1],
        'mes': str(row[2]) if row[2] else '',
        'data': str(row[3]) if row[3] else '',
        'hora': str(row[4]) if row[4] else '',
        'cod_transacao': str(row[5]) if row[5] else '',
        'usuario': str(row[8]) if row[8] else '',
        'tipo': tipo,
        'descricao': str(row[10]) if row[10] else '',
        'valor': valor,
        'cpf': str(row[12]) if row[12] else '',
    })
    planilha_extrato_tipos[tipo]['count'] += 1
    planilha_extrato_tipos[tipo]['sum'] += valor

print(f"    Planilha EXTRATO: {len(planilha_extrato)} registros")
for t, v in sorted(planilha_extrato_tipos.items(), key=lambda x: -x[1]['count']):
    print(f"      {t}: count={v['count']}, sum={v['sum']:.2f}")

# 1c. PAINEL (planilha)
print("  Lendo PAINEL da planilha...")
ws_painel = wb_pl['PAINEL']
planilha_painel = {}
for row in ws_painel.iter_rows(min_row=12, values_only=True):
    if row[2] is None:
        continue
    cpf = str(row[2]).strip()
    planilha_painel[cpf] = {
        'nome': str(row[1]).strip() if row[1] else '',
        'situacao': str(row[4]).strip() if row[4] else '',
        'status_cartao': str(row[5]).strip() if row[5] else '',
        'regional': str(row[8]).strip() if row[8] else '',
        'centro_custo': str(row[9]).strip() if row[9] else '',
        'carga': float(row[13]) if row[13] else 0.0,
        'transferencia': float(row[14]) if row[14] else 0.0,
        'tarifa': float(row[15]) if row[15] else 0.0,
        'prestacao': float(row[16]) if row[16] else 0.0,
        'saldo': float(row[17]) if row[17] else 0.0,
    }
print(f"    Planilha PAINEL: {len(planilha_painel)} pessoas")

# ============================================================
# 2. LER DADOS DO BANCO
# ============================================================

# 2a. prestacao_expenses
print("  Lendo prestacao_expenses do banco...")
cur.execute("""
    SELECT id, report_id, value::numeric, date, description, status,
           raw_data::json->>'rejected' as raw_rejected,
           raw_data::json->>'validate' as raw_validate,
           raw_data::json->>'payment_method_id' as payment_method_id,
           raw_data::json->>'payment_method_name' as payment_method_name
    FROM prestacao_expenses
    ORDER BY id
""")
bank_expenses = {}
bank_expense_status = defaultdict(int)
bank_null_status_details = []
for r in cur.fetchall():
    eid = str(r[0])
    status = r[5]
    bank_expenses[eid] = {
        'id': eid,
        'report_id': str(r[1]) if r[1] else '',
        'value': float(r[2]) if r[2] else 0.0,
        'date': str(r[3]) if r[3] else '',
        'description': r[4] or '',
        'status': status or 'NULL',
        'raw_rejected': r[6],
        'raw_validate': r[7],
        'payment_method_id': r[8],
        'payment_method_name': r[9],
    }
    bank_expense_status[status or 'NULL'] += 1
    if status is None:
        bank_null_status_details.append(bank_expenses[eid])

print(f"    Banco prestacao_expenses: {len(bank_expenses)} despesas")
for s, c in sorted(bank_expense_status.items(), key=lambda x: -x[1]):
    print(f"      {s}: {c}")

# 2b. extrato_movimentacao
print("  Lendo extrato_movimentacao do banco...")
cur.execute("""
    SELECT id, tipo, valor::numeric, data, usuario, descricao, grupo
    FROM extrato_movimentacao
    ORDER BY id
""")
bank_extrato = []
bank_extrato_tipos = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for r in cur.fetchall():
    tipo = r[1] if r[1] else 'NULL'
    valor = float(r[2]) if r[2] else 0.0
    bank_extrato.append({
        'id': r[0],
        'tipo': tipo,
        'valor': valor,
        'data': str(r[3]) if r[3] else '',
        'usuario': r[4] or '',
        'descricao': r[5] or '',
        'grupo': r[6] or '',
    })
    bank_extrato_tipos[tipo]['count'] += 1
    bank_extrato_tipos[tipo]['sum'] += valor

print(f"    Banco extrato: {len(bank_extrato)} registros")
for t, v in sorted(bank_extrato_tipos.items(), key=lambda x: -x[1]['count']):
    print(f"      {t}: count={v['count']}, sum={v['sum']:.2f}")

# 2c. frozen snapshots Q2
print("  Lendo frozen snapshots Q2 Agosto...")
cur.execute("""
    SELECT cpf, colaborador, carga::numeric, transferencia::numeric, tarifa::numeric,
           prestacao::numeric, saldo_cartao::numeric, saldo_prestacao::numeric,
           saldo_final::numeric, saldo_reembolsar::numeric
    FROM quinzena_frozen_snapshots
    WHERE year = 2026 AND month = 8 AND quinzena = 2
    ORDER BY colaborador
""")
bank_frozen = {}
for r in cur.fetchall():
    cpf = str(r[0]).strip()
    bank_frozen[cpf] = {
        'cpf': cpf,
        'nome': r[1] or '',
        'carga': float(r[2]) if r[2] else 0.0,
        'transferencia': float(r[3]) if r[3] else 0.0,
        'tarifa': float(r[4]) if r[4] else 0.0,
        'prestacao': float(r[5]) if r[5] else 0.0,
        'saldo_cartao': float(r[6]) if r[6] else 0.0,
        'saldo_prestacao': float(r[7]) if r[7] else 0.0,
        'saldo_final': float(r[8]) if r[8] else 0.0,
        'saldo_reembolsar': float(r[9]) if r[9] else 0.0,
    }
print(f"    Banco frozen Q2: {len(bank_frozen)} pessoas")

# 2d. Report status for null expense analysis
print("  Lendo report status para despesas NULL...")
cur.execute("""
    SELECT e.id, e.report_id, e.value::numeric, e.date, e.description, e.status,
           e.raw_data::json->>'rejected' as raw_rejected,
           e.raw_data::json->>'validate' as raw_validate,
           e.raw_data::json->>'on' as raw_on,
           e.raw_data::json->>'payment_method_id' as payment_method_id,
           r.status as report_status, r.name as report_name,
           r.user_cpf as report_cpf, r.user_name as report_user
    FROM prestacao_expenses e
    LEFT JOIN prestacao_reports r ON e.report_id = r.id
    WHERE e.status IS NULL
    ORDER BY e.id
""")
null_expense_details = []
for r in cur.fetchall():
    null_expense_details.append({
        'expense_id': r[0],
        'report_id': r[1],
        'value': float(r[2]) if r[2] else 0.0,
        'date': str(r[3]) if r[3] else '',
        'description': r[4] or '',
        'status': 'NULL',
        'raw_rejected': r[6],
        'raw_validate': r[7],
        'raw_on': r[8],
        'payment_method_id': r[9],
        'report_status': r[10] or '',
        'report_name': r[11] or '',
        'report_cpf': r[12] or '',
        'report_user': r[13] or '',
    })
print(f"    Despesas com status NULL: {len(null_expense_details)}")

# 2e. Extrato comparison data - get planilha extrato CPFs and dates
print("  Lendo extrato do banco para comparacao...")

# Get bank extrato summary by tipo for comparison
cur.execute("""
    SELECT 
      COALESCE(tipo, 'NULL') as tipo,
      COUNT(*) as count,
      SUM(valor::numeric) as sum
    FROM extrato_movimentacao
    GROUP BY COALESCE(tipo, 'NULL')
    ORDER BY sum DESC
""")
bank_extrato_summary = {}
for r in cur.fetchall():
    bank_extrato_summary[r[0]] = {'count': r[1], 'sum': float(r[2])}

# Get bank extrato by usuario for comparison
cur.execute("""
    SELECT 
      COALESCE(usuario, 'NULL') as usuario,
      COUNT(*) as count,
      SUM(valor::numeric) as sum
    FROM extrato_movimentacao
    WHERE tipo IS NULL OR tipo = 'Transferencia'
    GROUP BY COALESCE(usuario, 'NULL')
    ORDER BY sum DESC
    LIMIT 50
""")
bank_extrato_by_user = {}
for r in cur.fetchall():
    bank_extrato_by_user[r[0]] = {'count': r[1], 'sum': float(r[2]) if r[2] else 0.0}

cur.close()
conn.close()
print("Banco desconectado.")

# ============================================================
# 3. CALCULAR DIFERENCAS
# ============================================================
print("\nCalculando diferencas...")

# 3a. Diff BASE PREST
planilha_ids = set(planilha_expenses.keys())
bank_ids = set(bank_expenses.keys())
only_planilha = planilha_ids - bank_ids
only_bank = bank_ids - planilha_ids
both = planilha_ids & bank_ids
status_mismatch = []
value_mismatch = []

for eid in both:
    p = planilha_expenses[eid]
    b = bank_expenses[eid]
    p_status = p['status'].upper() if p['status'] else ''
    b_status = (b['status'] or '').upper() if b['status'] != 'NULL' else ''
    if p_status and b_status and p_status != b_status:
        status_mismatch.append({
            'id': eid,
            'planilha_status': p['status'],
            'banco_status': b['status'],
            'report_id': p['report_id'],
            'description': p['description'],
            'value_planilha': 0,
            'value_banco': b['value'],
        })

print(f"  Diff BASE PREST:")
print(f"    Apenas na planilha: {len(only_planilha)}")
print(f"    Apenas no banco: {len(only_bank)}")
print(f"    Em ambos: {len(both)}")
print(f"    Status divergente: {len(status_mismatch)}")

# 3b. Diff PAINEL
painel_diffs = []
all_cpfs = set(planilha_painel.keys()) | set(bank_frozen.keys())
for cpf in sorted(all_cpfs):
    p = planilha_painel.get(cpf)
    b = bank_frozen.get(cpf)
    if p and b:
        diff_carga = b['carga'] - p['carga']
        diff_transf = b['transferencia'] - abs(p['transferencia'])
        diff_tarifa = b['tarifa'] - abs(p['tarifa'])
        diff_prest = b['prestacao'] - p['prestacao']
        diff_saldo = b['saldo_prestacao'] - p['saldo']
        if abs(diff_carga) > 0.01 or abs(diff_transf) > 0.01 or abs(diff_tarifa) > 0.01 or abs(diff_prest) > 0.01 or abs(diff_saldo) > 0.01:
            painel_diffs.append({
                'cpf': cpf,
                'nome': p['nome'] or b['nome'],
                'carga_planilha': p['carga'],
                'carga_banco': b['carga'],
                'diff_carga': diff_carga,
                'transf_planilha': abs(p['transferencia']),
                'transf_banco': b['transferencia'],
                'diff_transf': diff_transf,
                'tarifa_planilha': abs(p['tarifa']),
                'tarifa_banco': b['tarifa'],
                'diff_tarifa': diff_tarifa,
                'prest_planilha': p['prestacao'],
                'prest_banco': b['prestacao'],
                'diff_prest': diff_prest,
                'saldo_planilha': p['saldo'],
                'saldo_banco_prest': b['saldo_prestacao'],
                'saldo_banco_final': b['saldo_final'],
                'saldo_banco_cartao': b['saldo_cartao'],
                'diff_saldo': diff_saldo,
            })
    elif p and not b:
        painel_diffs.append({
            'cpf': cpf, 'nome': p['nome'],
            'carga_planilha': p['carga'], 'carga_banco': 0, 'diff_carga': -p['carga'],
            'transf_planilha': abs(p['transferencia']), 'transf_banco': 0, 'diff_transf': -abs(p['transferencia']),
            'tarifa_planilha': abs(p['tarifa']), 'tarifa_banco': 0, 'diff_tarifa': -abs(p['tarifa']),
            'prest_planilha': p['prestacao'], 'prest_banco': 0, 'diff_prest': -p['prestacao'],
            'saldo_planilha': p['saldo'], 'saldo_banco_prest': 0, 'saldo_banco_final': 0, 'saldo_banco_cartao': 0,
            'diff_saldo': -p['saldo'],
        })
    elif b and not p:
        painel_diffs.append({
            'cpf': cpf, 'nome': b['nome'],
            'carga_planilha': 0, 'carga_banco': b['carga'], 'diff_carga': b['carga'],
            'transf_planilha': 0, 'transf_banco': b['transferencia'], 'diff_transf': b['transferencia'],
            'tarifa_planilha': 0, 'tarifa_banco': b['tarifa'], 'diff_tarifa': b['tarifa'],
            'prest_planilha': 0, 'prest_banco': b['prestacao'], 'diff_prest': b['prestacao'],
            'saldo_planilha': 0, 'saldo_banco_prest': b['saldo_prestacao'], 'saldo_banco_final': b['saldo_final'], 'saldo_banco_cartao': b['saldo_cartao'],
            'diff_saldo': b['saldo_prestacao'],
        })

print(f"    Diferencas no PAINEL: {len(painel_diffs)} pessoas com diff")

# 3c. Extrato diff by tipo
print(f"  Diff EXTRATO por tipo:")
for tipo in set(list(planilha_extrato_tipos.keys()) + list(bank_extrato_tipos.keys())):
    p = planilha_extrato_tipos.get(tipo, {'count': 0, 'sum': 0.0})
    b = bank_extrato_tipos.get(tipo, {'count': 0, 'sum': 0.0})
    # Map planilha types to bank types
    tipo_map = {'CARGA': 'NULL', 'TARIFA': 'Taxa', 'TRANSFERÊNCIA': 'Transferência',
                'Transferência': 'Transferência',
                'COMPRA': 'Compra', 'SAQUE': 'Saque', 'PIX': 'Pix',
                'ESTORNO': 'Estorno', 'ESTORNO DE TAXA': 'Estorno de taxa'}
    bank_tipo = tipo_map.get(tipo.upper(), tipo)
    b2 = bank_extrato_tipos.get(bank_tipo, {'count': 0, 'sum': 0.0})
    print(f"    {tipo} (planilha) vs {bank_tipo} (banco): count={p['count']}vs{b2['count']}, sum={p['sum']:.2f}vs{b2['sum']:.2f}")

# ============================================================
# 4. GERAR EXCEL
# ============================================================
print(f"\nGerando Excel: {OUTPUT_PATH}")
wb = xlsxwriter.Workbook(OUTPUT_PATH)
wb.set_properties({'title': 'Comparacao Banco vs Planilha - Agosto 2026'})

# Formats
fmt_header = wb.add_format({'bold': True, 'bg_color': '#4472C4', 'font_color': 'white', 'border': 1, 'text_wrap': True})
fmt_title = wb.add_format({'bold': True, 'font_size': 14, 'bg_color': '#1F4E79', 'font_color': 'white'})
fmt_subtitle = wb.add_format({'bold': True, 'font_size': 11, 'bg_color': '#D6E4F0'})
fmt_num = wb.add_format({'num_format': '#,##0.00', 'border': 1})
fmt_num_red = wb.add_format({'num_format': '#,##0.00', 'border': 1, 'font_color': 'red', 'bold': True})
fmt_num_green = wb.add_format({'num_format': '#,##0.00', 'border': 1, 'font_color': 'green'})
fmt_text = wb.add_format({'border': 1})
fmt_text_red = wb.add_format({'border': 1, 'font_color': 'red', 'bold': True})
fmt_pct = wb.add_format({'num_format': '0.00%', 'border': 1})
fmt_date = wb.add_format({'border': 1, 'num_format': 'yyyy-mm-dd'})

# ============================================================
# ABA 1: RESUMO
# ============================================================
ws = wb.add_worksheet('RESUMO')
ws.set_column('A:A', 35)
ws.set_column('B:E', 18)

ws.merge_range('A1:E1', 'COMPARACAO: BANCO DE DADOS vs PLANILHA CONTROLE', fmt_title)
ws.merge_range('A2:E2', f'Gerado em: {datetime.now().strftime("%d/%m/%Y %H:%M")}', fmt_subtitle)

row = 3

# Resumo BASE PREST
ws.merge_range(row, 0, row, 4, '1. BASE PREST (Despesas)', fmt_subtitle)
row += 1
ws.write(row, 0, 'Metrica', fmt_header)
ws.write(row, 1, 'Planilha', fmt_header)
ws.write(row, 2, 'Banco', fmt_header)
ws.write(row, 3, 'Diferenca', fmt_header)
ws.write(row, 4, '% Diff', fmt_header)
row += 1

bp_data = [
    ('Total despesas', len(planilha_expenses), len(bank_expenses)),
    ('Status Aprovado', planilha_expense_status.get('Aprovado', 0), bank_expense_status.get('Aprovado', 0) + bank_expense_status.get('APROVADO', 0)),
    ('Status Enviado', planilha_expense_status.get('Enviado', 0), bank_expense_status.get('Enviado', 0) + bank_expense_status.get('ENVIADO', 0)),
    ('Status NULL', 0, bank_expense_status.get('NULL', 0)),
    ('Status Aberto', 0, bank_expense_status.get('Aberto', 0) + bank_expense_status.get('ABERTO', 0)),
    ('Status Reprovado', 0, bank_expense_status.get('Reprovado', 0) + bank_expense_status.get('REPROVADO', 0)),
    ('IDs apenas na planilha', len(only_planilha), '-'),
    ('IDs apenas no banco', '-', len(only_bank)),
    ('Status divergentes', '-', len(status_mismatch)),
]
for label, p, b in bp_data:
    ws.write(row, 0, label, fmt_text)
    ws.write(row, 1, p if isinstance(p, (int, float)) else str(p), fmt_text)
    ws.write(row, 2, b if isinstance(b, (int, float)) else str(b), fmt_text)
    if isinstance(p, (int, float)) and isinstance(b, (int, float)):
        diff = b - p
        pct = (diff / p) if p else 0
        ws.write(row, 3, diff, fmt_num if abs(diff) < 0.01 else fmt_num_red)
        ws.write(row, 4, pct, fmt_pct)
    else:
        ws.write(row, 3, '-', fmt_text)
        ws.write(row, 4, '-', fmt_text)
    row += 1

row += 1

# Resumo EXTRATO
ws.merge_range(row, 0, row, 4, '2. EXTRATO (Movimentacoes)', fmt_subtitle)
row += 1
ws.write(row, 0, 'Tipo', fmt_header)
ws.write(row, 1, 'Planilha Count', fmt_header)
ws.write(row, 2, 'Banco Count', fmt_header)
ws.write(row, 3, 'Planilha Sum', fmt_header)
ws.write(row, 4, 'Banco Sum', fmt_header)
row += 1

tipo_map = {'CARGA': 'NULL', 'TARIFA': 'Taxa', 'TRANSFERÊNCIA': 'Transferência',
            'Transferência': 'Transferência',
            'COMPRA': 'Compra', 'SAQUE': 'Saque', 'PIX': 'Pix',
            'ESTORNO': 'Estorno', 'ESTORNO DE TAXA': 'Estorno de taxa'}
for tipo_pl in sorted(planilha_extrato_tipos.keys()):
    tipo_bk = tipo_map.get(tipo_pl.upper(), tipo_pl)
    p = planilha_extrato_tipos[tipo_pl]
    b = bank_extrato_tipos.get(tipo_bk, {'count': 0, 'sum': 0.0})
    ws.write(row, 0, f"{tipo_pl} -> {tipo_bk}", fmt_text)
    ws.write(row, 1, p['count'], fmt_text)
    ws.write(row, 2, b['count'], fmt_text)
    ws.write(row, 3, p['sum'], fmt_num)
    ws.write(row, 4, b['sum'], fmt_num)
    row += 1

# Also show bank-only types
for tipo_bk in sorted(bank_extrato_tipos.keys()):
    if tipo_bk not in [tipo_map.get(t.upper(), t) for t in planilha_extrato_tipos.keys()]:
        b = bank_extrato_tipos[tipo_bk]
        ws.write(row, 0, f"(banco only) {tipo_bk}", fmt_text)
        ws.write(row, 1, 0, fmt_text)
        ws.write(row, 2, b['count'], fmt_text)
        ws.write(row, 3, 0, fmt_num)
        ws.write(row, 4, b['sum'], fmt_num)
        row += 1

row += 1

# Resumo PAINEL
ws.merge_range(row, 0, row, 4, '3. PAINEL (Totais por pessoa)', fmt_subtitle)
row += 1
ws.write(row, 0, 'Campo', fmt_header)
ws.write(row, 1, 'Planilha', fmt_header)
ws.write(row, 2, 'Banco (frozen Q2)', fmt_header)
ws.write(row, 3, 'Diferenca', fmt_header)
ws.write(row, 4, '% Diff', fmt_header)
row += 1

p_carga = sum(v['carga'] for v in planilha_painel.values())
b_carga = sum(v['carga'] for v in bank_frozen.values())
p_transf = sum(abs(v['transferencia']) for v in planilha_painel.values())
b_transf = sum(v['transferencia'] for v in bank_frozen.values())
p_tarifa = sum(abs(v['tarifa']) for v in planilha_painel.values())
b_tarifa = sum(v['tarifa'] for v in bank_frozen.values())
p_prest = sum(v['prestacao'] for v in planilha_painel.values())
b_prest = sum(v['prestacao'] for v in bank_frozen.values())
p_saldo = sum(v['saldo'] for v in planilha_painel.values())
b_saldo_prest = sum(v['saldo_prestacao'] for v in bank_frozen.values())
b_saldo_final = sum(v['saldo_final'] for v in bank_frozen.values())
b_saldo_cartao = sum(v['saldo_cartao'] for v in bank_frozen.values())

painel_data = [
    ('Pessoas', len(planilha_painel), len(bank_frozen)),
    ('Carga', p_carga, b_carga),
    ('Transferencia', p_transf, b_transf),
    ('Tarifa', p_tarifa, b_tarifa),
    ('Prestacao', p_prest, b_prest),
    ('Saldo Prestacao (planilha) vs saldo_prestacao (banco)', p_saldo, b_saldo_prest),
    ('Saldo Final (banco only)', 0, b_saldo_final),
    ('Saldo Cartao (banco only)', 0, b_saldo_cartao),
    ('Pessoas com diferenca', '-', len(painel_diffs)),
]
for label, p, b in painel_data:
    ws.write(row, 0, label, fmt_text)
    if isinstance(p, float):
        ws.write(row, 1, p, fmt_num)
    else:
        ws.write(row, 1, p, fmt_text)
    if isinstance(b, float):
        ws.write(row, 2, b, fmt_num)
    else:
        ws.write(row, 2, b, fmt_text)
    if isinstance(p, (int, float)) and isinstance(b, (int, float)):
        diff = b - p
        pct = (diff / abs(p)) if p else 0
        ws.write(row, 3, diff, fmt_num if abs(diff) < 0.01 else fmt_num_red)
        ws.write(row, 4, pct, fmt_pct)
    else:
        ws.write(row, 3, '-', fmt_text)
        ws.write(row, 4, '-', fmt_text)
    row += 1

row += 1

# Resumo Status NULL
ws.merge_range(row, 0, row, 4, '4. DESPESAS COM STATUS NULL (Banco)', fmt_subtitle)
row += 1
ws.write(row, 0, 'Metrica', fmt_header)
ws.write(row, 1, 'Valor', fmt_header)
row += 1
ws.write(row, 0, 'Total despesas NULL', fmt_text)
ws.write(row, 1, bank_expense_status.get('NULL', 0), fmt_text)
row += 1
ws.write(row, 0, 'Soma valor NULL', fmt_text)
ws.write(row, 1, sum(e['value'] for e in bank_null_status_details), fmt_num)
row += 1
ws.write(row, 0, 'Causa raiz', fmt_text)
ws.write(row, 1, 'API V2 nao retorna campo status na despesa', fmt_text_red)
row += 1
ws.write(row, 0, 'Linha no codigo', fmt_text)
ws.write(row, 1, 'pipeline.ts:705 - e.status || null', fmt_text_red)
row += 1

# ============================================================
# ABA 2: DIFF BASE PREST - IDs apenas na planilha
# ============================================================
ws2 = wb.add_worksheet('Diff_BASE_PREST')
ws2.set_column('A:A', 15)
ws2.set_column('B:C', 15)
ws2.set_column('D:E', 25)
ws2.set_column('F:G', 15)
ws2.set_column('H:I', 20)

ws2.merge_range('A1:I1', 'DIFERENCAS: BASE PREST (Planilha) vs prestacao_expenses (Banco)', fmt_title)
row = 2

# Section 1: IDs apenas na planilha
ws2.merge_range(row, 0, row, 8, f'IDs apenas na PLANILHA ({len(only_planilha)} registros)', fmt_subtitle)
row += 1
headers = ['Expense ID', 'Report ID', 'Report Name', 'User Name', 'CPF', 'Status Planilha', 'Description', 'Tipo', 'Payment Method']
for c, h in enumerate(headers):
    ws2.write(row, c, h, fmt_header)
row += 1
for eid in sorted(only_planilha, key=lambda x: int(x) if x.isdigit() else 0):
    p = planilha_expenses[eid]
    ws2.write(row, 0, eid, fmt_text)
    ws2.write(row, 1, p['report_id'], fmt_text)
    ws2.write(row, 2, p['report_name'], fmt_text)
    ws2.write(row, 3, p['user_name'], fmt_text)
    ws2.write(row, 4, p['cpf'], fmt_text)
    ws2.write(row, 5, p['status'], fmt_text)
    ws2.write(row, 6, p['description'], fmt_text)
    ws2.write(row, 7, p['tipo'], fmt_text)
    ws2.write(row, 8, p['payment_method'], fmt_text)
    row += 1

row += 2

# Section 2: IDs apenas no banco
ws2.merge_range(row, 0, row, 8, f'IDs apenas no BANCO ({len(only_bank)} registros)', fmt_subtitle)
row += 1
headers = ['Expense ID', 'Report ID', 'Value', 'Date', 'Description', 'Status Banco', 'Raw Rejected', 'Payment Method ID', 'Payment Method Name']
for c, h in enumerate(headers):
    ws2.write(row, c, h, fmt_header)
row += 1
for eid in sorted(only_bank, key=lambda x: int(x) if x.isdigit() else 0)[:500]:  # Limit to 500
    b = bank_expenses[eid]
    ws2.write(row, 0, eid, fmt_text)
    ws2.write(row, 1, b['report_id'], fmt_text)
    ws2.write(row, 2, b['value'], fmt_num)
    ws2.write(row, 3, b['date'], fmt_text)
    ws2.write(row, 4, b['description'], fmt_text)
    ws2.write(row, 5, b['status'], fmt_text)
    ws2.write(row, 6, b['raw_rejected'] or '', fmt_text)
    ws2.write(row, 7, b['payment_method_id'] or '', fmt_text)
    ws2.write(row, 8, b['payment_method_name'] or '', fmt_text)
    row += 1
if len(only_bank) > 500:
    ws2.write(row, 0, f"... ({len(only_bank) - 500} mais)", fmt_text)
    row += 1

row += 2

# Section 3: Status divergentes
ws2.merge_range(row, 0, row, 8, f'STATUS DIVERGENTES ({len(status_mismatch)} registros)', fmt_subtitle)
row += 1
headers = ['Expense ID', 'Report ID', 'Description', 'Status Planilha', 'Status Banco', 'Value Banco']
for c, h in enumerate(headers):
    ws2.write(row, c, h, fmt_header)
row += 1
for s in status_mismatch[:500]:
    ws2.write(row, 0, s['id'], fmt_text)
    ws2.write(row, 1, s['report_id'], fmt_text)
    ws2.write(row, 2, s['description'], fmt_text)
    ws2.write(row, 3, s['planilha_status'], fmt_text_red)
    ws2.write(row, 4, s['banco_status'], fmt_text_red)
    ws2.write(row, 5, s['value_banco'], fmt_num)
    row += 1

# ============================================================
# ABA 3: DIFF EXTRATO
# ============================================================
ws3 = wb.add_worksheet('Diff_EXTRATO')
ws3.set_column('A:A', 15)
ws3.set_column('B:D', 20)
ws3.set_column('E:F', 18)
ws3.set_column('G:H', 15)

ws3.merge_range('A1:H1', 'DIFERENCAS: EXTRATO (Planilha) vs extrato_movimentacao (Banco)', fmt_title)
row = 2

# Section 1: Resumo por tipo
ws3.merge_range(row, 0, row, 7, 'Resumo por Tipo', fmt_subtitle)
row += 1
ws3.write(row, 0, 'Tipo Planilha', fmt_header)
ws3.write(row, 1, 'Tipo Banco', fmt_header)
ws3.write(row, 2, 'Planilha Count', fmt_header)
ws3.write(row, 3, 'Banco Count', fmt_header)
ws3.write(row, 4, 'Diff Count', fmt_header)
ws3.write(row, 5, 'Planilha Sum', fmt_header)
ws3.write(row, 6, 'Banco Sum', fmt_header)
ws3.write(row, 7, 'Diff Sum', fmt_header)
row += 1

for tipo_pl in sorted(planilha_extrato_tipos.keys()):
    tipo_bk = tipo_map.get(tipo_pl.upper(), tipo_pl)
    p = planilha_extrato_tipos[tipo_pl]
    b = bank_extrato_tipos.get(tipo_bk, {'count': 0, 'sum': 0.0})
    ws3.write(row, 0, tipo_pl, fmt_text)
    ws3.write(row, 1, tipo_bk, fmt_text)
    ws3.write(row, 2, p['count'], fmt_text)
    ws3.write(row, 3, b['count'], fmt_text)
    ws3.write(row, 4, b['count'] - p['count'], fmt_num_red if abs(b['count'] - p['count']) > 0 else fmt_text)
    ws3.write(row, 5, p['sum'], fmt_num)
    ws3.write(row, 6, b['sum'], fmt_num)
    ws3.write(row, 7, b['sum'] - p['sum'], fmt_num_red if abs(b['sum'] - p['sum']) > 1 else fmt_num)
    row += 1

# Bank-only types
for tipo_bk in sorted(bank_extrato_tipos.keys()):
    if tipo_bk not in [tipo_map.get(t.upper(), t) for t in planilha_extrato_tipos.keys()]:
        b = bank_extrato_tipos[tipo_bk]
        ws3.write(row, 0, '(banco only)', fmt_text)
        ws3.write(row, 1, tipo_bk, fmt_text)
        ws3.write(row, 2, 0, fmt_text)
        ws3.write(row, 3, b['count'], fmt_text)
        ws3.write(row, 4, b['count'], fmt_num_red)
        ws3.write(row, 5, 0, fmt_num)
        ws3.write(row, 6, b['sum'], fmt_num)
        ws3.write(row, 7, b['sum'], fmt_num_red)
        row += 1

row += 2

# Section 2: Extrato por usuario (top 50)
ws3.merge_range(row, 0, row, 7, 'Extrato por Usuario (Banco - tipo NULL = CARGA)', fmt_subtitle)
row += 1
ws3.write(row, 0, 'Usuario', fmt_header)
ws3.write(row, 1, 'Banco Count', fmt_header)
ws3.write(row, 2, 'Banco Sum', fmt_header)
row += 1
for user, data in sorted(bank_extrato_by_user.items(), key=lambda x: -x[1]['sum'])[:50]:
    ws3.write(row, 0, user, fmt_text)
    ws3.write(row, 1, data['count'], fmt_text)
    ws3.write(row, 2, data['sum'], fmt_num)
    row += 1

row += 2

# Section 3: Planilha extrato sample (first 100 rows)
ws3.merge_range(row, 0, row, 7, f'Planilha EXTRATO - Amostra (primeiros 100)', fmt_subtitle)
row += 1
headers = ['Ano', 'Mes', 'Data', 'Tipo', 'Descricao', 'Valor', 'CPF', 'Usuario']
for c, h in enumerate(headers):
    ws3.write(row, c, h, fmt_header)
row += 1
for e in planilha_extrato[:100]:
    ws3.write(row, 0, e['ano'], fmt_text)
    ws3.write(row, 1, e['mes'], fmt_text)
    ws3.write(row, 2, e['data'], fmt_text)
    ws3.write(row, 3, e['tipo'], fmt_text)
    ws3.write(row, 4, e['descricao'], fmt_text)
    ws3.write(row, 5, e['valor'], fmt_num)
    ws3.write(row, 6, e['cpf'], fmt_text)
    ws3.write(row, 7, e['usuario'], fmt_text)
    row += 1

# ============================================================
# ABA 4: STATUS NULL (Detalhado)
# ============================================================
ws4 = wb.add_worksheet('Status_NULL')
ws4.set_column('A:A', 15)
ws4.set_column('B:C', 15)
ws4.set_column('D:E', 25)
ws4.set_column('F:I', 15)

ws4.merge_range('A1:I1', 'DESPESAS COM STATUS NULL NO BANCO (Investigacao)', fmt_title)
row = 2

ws4.merge_range(row, 0, row, 8, f'Total: {len(null_expense_details)} despesas com status NULL', fmt_subtitle)
row += 1
ws4.merge_range(row, 0, row, 8, 'Causa raiz: pipeline.ts linha 705 - e.status || null (API V2 nao retorna campo status)', fmt_subtitle)
row += 1

# Summary by report_status
ws4.merge_range(row, 0, row, 8, 'Resumo por status do relatorio pai', fmt_subtitle)
row += 1
report_status_counts = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for e in null_expense_details:
    rs = e['report_status'] or 'NULL'
    report_status_counts[rs]['count'] += 1
    report_status_counts[rs]['sum'] += e['value']

ws4.write(row, 0, 'Report Status', fmt_header)
ws4.write(row, 1, 'Count', fmt_header)
ws4.write(row, 2, 'Sum Value', fmt_header)
row += 1
for rs, data in sorted(report_status_counts.items(), key=lambda x: -x[1]['count']):
    ws4.write(row, 0, rs, fmt_text)
    ws4.write(row, 1, data['count'], fmt_text)
    ws4.write(row, 2, data['sum'], fmt_num)
    row += 1

row += 2

# Summary by raw_validate
ws4.merge_range(row, 0, row, 8, 'Resumo por raw_validate (campo da API)', fmt_subtitle)
row += 1
validate_counts = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for e in null_expense_details:
    v = e['raw_validate'] or 'NULL'
    validate_counts[v]['count'] += 1
    validate_counts[v]['sum'] += e['value']

ws4.write(row, 0, 'Validate', fmt_header)
ws4.write(row, 1, 'Count', fmt_header)
ws4.write(row, 2, 'Sum Value', fmt_header)
ws4.write(row, 3, 'Interpretacao', fmt_header)
row += 1
validate_interp = {'S': 'Aprovado/Validado', 'N': 'Reprovado/Nao validado', '': 'Sem validacao', 'NULL': 'Campo nulo'}
for v, data in sorted(validate_counts.items(), key=lambda x: -x[1]['count']):
    ws4.write(row, 0, v, fmt_text)
    ws4.write(row, 1, data['count'], fmt_text)
    ws4.write(row, 2, data['sum'], fmt_num)
    ws4.write(row, 3, validate_interp.get(v, '?'), fmt_text)
    row += 1

row += 2

# Summary by payment_method_id
ws4.merge_range(row, 0, row, 8, 'Resumo por payment_method_id', fmt_subtitle)
row += 1
pm_counts = defaultdict(lambda: {'count': 0, 'sum': 0.0})
for e in null_expense_details:
    pm = e['payment_method_id'] or 'NULL'
    pm_counts[pm]['count'] += 1
    pm_counts[pm]['sum'] += e['value']

ws4.write(row, 0, 'Payment Method ID', fmt_header)
ws4.write(row, 1, 'Count', fmt_header)
ws4.write(row, 2, 'Sum Value', fmt_header)
row += 1
for pm, data in sorted(pm_counts.items(), key=lambda x: -x[1]['count']):
    ws4.write(row, 0, pm, fmt_text)
    ws4.write(row, 1, data['count'], fmt_text)
    ws4.write(row, 2, data['sum'], fmt_num)
    row += 1

row += 2

# Detailed list (first 1000)
ws4.merge_range(row, 0, row, 8, f'Detalhado (primeiros 1000 de {len(null_expense_details)})', fmt_subtitle)
row += 1
headers = ['Expense ID', 'Report ID', 'Value', 'Date', 'Description', 'Report Status', 'Report Name', 'Report CPF', 'Report User']
for c, h in enumerate(headers):
    ws4.write(row, c, h, fmt_header)
row += 1
for e in null_expense_details[:1000]:
    ws4.write(row, 0, e['expense_id'], fmt_text)
    ws4.write(row, 1, e['report_id'], fmt_text)
    ws4.write(row, 2, e['value'], fmt_num)
    ws4.write(row, 3, e['date'], fmt_text)
    ws4.write(row, 4, e['description'], fmt_text)
    ws4.write(row, 5, e['report_status'], fmt_text_red)
    ws4.write(row, 6, e['report_name'], fmt_text)
    ws4.write(row, 7, e['report_cpf'], fmt_text)
    ws4.write(row, 8, e['report_user'], fmt_text)
    row += 1
if len(null_expense_details) > 1000:
    ws4.write(row, 0, f"... ({len(null_expense_details) - 1000} mais)", fmt_text)
    row += 1

# ============================================================
# ABA 5: DIFF PAINEL (por pessoa)
# ============================================================
ws5 = wb.add_worksheet('Diff_PAINEL')
ws5.set_column('A:A', 15)
ws5.set_column('B:B', 30)
ws5.set_column('C:R', 15)

ws5.merge_range('A1:R1', 'DIFERENCAS: PAINEL (Planilha) vs Frozen Snapshots Q2 (Banco)', fmt_title)
row = 2

ws5.merge_range(row, 0, row, 17, f'Pessoas com diferenca: {len(painel_diffs)} de {len(all_cpfs)} total', fmt_subtitle)
row += 1

headers = ['CPF', 'Nome', 'Carga Plan', 'Carga Banco', 'Diff Carga',
           'Transf Plan', 'Transf Banco', 'Diff Transf',
           'Tarifa Plan', 'Tarifa Banco', 'Diff Tarifa',
           'Prest Plan', 'Prest Banco', 'Diff Prest',
           'Saldo Plan', 'Saldo Banco Prest', 'Saldo Banco Final', 'Diff Saldo']
for c, h in enumerate(headers):
    ws5.write(row, c, h, fmt_header)
row += 1

for d in sorted(painel_diffs, key=lambda x: abs(x.get('diff_carga', 0)) + abs(x.get('diff_prest', 0)), reverse=True):
    ws5.write(row, 0, d['cpf'], fmt_text)
    ws5.write(row, 1, d['nome'], fmt_text)
    ws5.write(row, 2, d['carga_planilha'], fmt_num)
    ws5.write(row, 3, d['carga_banco'], fmt_num)
    fmt = fmt_num if abs(d['diff_carga']) < 0.01 else fmt_num_red
    ws5.write(row, 4, d['diff_carga'], fmt)
    ws5.write(row, 5, d['transf_planilha'], fmt_num)
    ws5.write(row, 6, d['transf_banco'], fmt_num)
    fmt = fmt_num if abs(d['diff_transf']) < 0.01 else fmt_num_red
    ws5.write(row, 7, d['diff_transf'], fmt)
    ws5.write(row, 8, d['tarifa_planilha'], fmt_num)
    ws5.write(row, 9, d['tarifa_banco'], fmt_num)
    fmt = fmt_num if abs(d['diff_tarifa']) < 0.01 else fmt_num_red
    ws5.write(row, 10, d['diff_tarifa'], fmt)
    ws5.write(row, 11, d['prest_planilha'], fmt_num)
    ws5.write(row, 12, d['prest_banco'], fmt_num)
    fmt = fmt_num if abs(d['diff_prest']) < 0.01 else fmt_num_red
    ws5.write(row, 13, d['diff_prest'], fmt)
    ws5.write(row, 14, d['saldo_planilha'], fmt_num)
    ws5.write(row, 15, d['saldo_banco_prest'], fmt_num)
    ws5.write(row, 16, d['saldo_banco_final'], fmt_num)
    fmt = fmt_num if abs(d['diff_saldo']) < 0.01 else fmt_num_red
    ws5.write(row, 17, d['diff_saldo'], fmt)
    row += 1

# ============================================================
# ABA 6: Status NULL - por report_name
# ============================================================
ws6 = wb.add_worksheet('NULL_por_Report')
ws6.set_column('A:A', 40)
ws6.set_column('B:E', 18)

ws6.merge_range('A1:E1', 'Despesas NULL agrupadas por Report Name', fmt_title)
row = 2

report_name_counts = defaultdict(lambda: {'count': 0, 'sum': 0.0, 'cpfs': set()})
for e in null_expense_details:
    rn = e['report_name'] or 'NULL'
    report_name_counts[rn]['count'] += 1
    report_name_counts[rn]['sum'] += e['value']
    if e['report_cpf']:
        report_name_counts[rn]['cpfs'].add(e['report_cpf'])

ws6.write(row, 0, 'Report Name', fmt_header)
ws6.write(row, 1, 'Count', fmt_header)
ws6.write(row, 2, 'Sum Value', fmt_header)
ws6.write(row, 3, 'Unique CPFs', fmt_header)
ws6.write(row, 4, 'Sample CPFs', fmt_header)
row += 1
for rn, data in sorted(report_name_counts.items(), key=lambda x: -x[1]['count']):
    ws6.write(row, 0, rn, fmt_text)
    ws6.write(row, 1, data['count'], fmt_text)
    ws6.write(row, 2, data['sum'], fmt_num)
    ws6.write(row, 3, len(data['cpfs']), fmt_text)
    ws6.write(row, 4, ', '.join(list(data['cpfs'])[:3]), fmt_text)
    row += 1

# ============================================================
# ABA 7: Status NULL - por CPF
# ============================================================
ws7 = wb.add_worksheet('NULL_por_CPF')
ws7.set_column('A:A', 15)
ws7.set_column('B:B', 30)
ws7.set_column('C:E', 18)

ws7.merge_range('A1:E1', 'Despesas NULL agrupadas por CPF', fmt_title)
row = 2

cpf_counts = defaultdict(lambda: {'count': 0, 'sum': 0.0, 'name': ''})
for e in null_expense_details:
    cpf = e['report_cpf'] or 'NULL'
    cpf_counts[cpf]['count'] += 1
    cpf_counts[cpf]['sum'] += e['value']
    if e['report_user']:
        cpf_counts[cpf]['name'] = e['report_user']

ws7.write(row, 0, 'CPF', fmt_header)
ws7.write(row, 1, 'Nome', fmt_header)
ws7.write(row, 2, 'Count', fmt_header)
ws7.write(row, 3, 'Sum Value', fmt_header)
row += 1
for cpf, data in sorted(cpf_counts.items(), key=lambda x: -x[1]['count']):
    ws7.write(row, 0, cpf, fmt_text)
    ws7.write(row, 1, data['name'], fmt_text)
    ws7.write(row, 2, data['count'], fmt_text)
    ws7.write(row, 3, data['sum'], fmt_num)
    row += 1

# ============================================================
# CLOSE
# ============================================================
wb.close()
print(f"\nPlanilha gerada: {OUTPUT_PATH}")
print(f"Abas: RESUMO, Diff_BASE_PREST, Diff_EXTRATO, Status_NULL, Diff_PAINEL, NULL_por_Report, NULL_por_CPF")
