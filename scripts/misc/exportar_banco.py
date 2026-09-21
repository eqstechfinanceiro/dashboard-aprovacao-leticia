import psycopg2
import xlsxwriter
from datetime import datetime

DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
OUTPUT = 'BASE_BANCO_PREST_EXTRATO.xlsx'

print("Conectando ao banco...")
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

print("Criando planilha...")
wb = xlsxwriter.Workbook(OUTPUT)

fmt_header = wb.add_format({'bold': True, 'bg_color': '#4472C4', 'font_color': 'white', 'border': 1, 'text_wrap': True})
fmt_title = wb.add_format({'bold': True, 'font_size': 14, 'bg_color': '#1F4E79', 'font_color': 'white'})
fmt_num = wb.add_format({'num_format': '#,##0.00', 'border': 1})
fmt_text = wb.add_format({'border': 1})
fmt_date = wb.add_format({'border': 1, 'num_format': 'yyyy-mm-dd'})

# ============================================================
# ABA 1: BASE PREST (banco)
# ============================================================
print("  Exportando BASE PREST...")
ws1 = wb.add_worksheet('BASE_PREST')
ws1.set_column('A:A', 15)
ws1.set_column('B:C', 15)
ws1.set_column('D:E', 25)
ws1.set_column('F:H', 15)
ws1.set_column('I:J', 20)

ws1.merge_range('A1:J1', 'BASE PREST - Banco de Dados (prestacao_expenses + prestacao_reports)', fmt_title)

headers = ['Expense ID', 'Report ID', 'Report Name', 'Report Status', 'User CPF', 'User Name', 'Date', 'Value', 'Description', 'Expense Status']
for c, h in enumerate(headers):
    ws1.write(2, c, h, fmt_header)

cur.execute("""
    SELECT e.id, e.report_id, r.name, r.status, r.user_cpf, r.user_name,
           e.date, e.value::numeric, e.description, e.status
    FROM prestacao_expenses e
    LEFT JOIN prestacao_reports r ON e.report_id = r.id
    ORDER BY e.id
""")

row = 3
count = 0
for r in cur.fetchall():
    ws1.write(row, 0, r[0], fmt_text)
    ws1.write(row, 1, r[1], fmt_text)
    ws1.write(row, 2, r[2] or '', fmt_text)
    ws1.write(row, 3, r[3] or '', fmt_text)
    ws1.write(row, 4, r[4] or '', fmt_text)
    ws1.write(row, 5, r[5] or '', fmt_text)
    ws1.write_datetime(row, 6, r[6] if r[6] else datetime(2000,1,1), fmt_date) if r[6] else ws1.write(row, 6, '', fmt_text)
    ws1.write(row, 7, float(r[7]) if r[7] else 0, fmt_num)
    ws1.write(row, 8, r[8] or '', fmt_text)
    ws1.write(row, 9, r[9] or 'NULL', fmt_text)
    row += 1
    count += 1

print(f"    {count} despesas exportadas")

# ============================================================
# ABA 2: EXTRATO (banco)
# ============================================================
print("  Exportando EXTRATO...")
ws2 = wb.add_worksheet('EXTRATO')
ws2.set_column('A:A', 10)
ws2.set_column('B:C', 12)
ws2.set_column('D:D', 15)
ws2.set_column('E:F', 20)
ws2.set_column('G:H', 15)
ws2.set_column('I:J', 25)

ws2.merge_range('A1:J1', 'EXTRATO - Banco de Dados (extrato_movimentacao)', fmt_title)

headers = ['ID', 'Data', 'Hora', 'Codigo Transacao', 'Usuario', 'Tipo', 'Descricao', 'Valor', 'Grupo', 'Snapshot']
for c, h in enumerate(headers):
    ws2.write(2, c, h, fmt_header)

cur.execute("""
    SELECT id, data, hora, codigo_transacao, usuario, tipo, descricao, valor::numeric, grupo, is_snapshot
    FROM extrato_movimentacao
    ORDER BY id
""")

row = 3
count = 0
for r in cur.fetchall():
    ws2.write(row, 0, r[0], fmt_text)
    if r[1]:
        ws2.write_datetime(row, 1, r[1], fmt_date)
    else:
        ws2.write(row, 1, '', fmt_text)
    ws2.write(row, 2, r[2] or '', fmt_text)
    ws2.write(row, 3, r[3] or '', fmt_text)
    ws2.write(row, 4, r[4] or '', fmt_text)
    ws2.write(row, 5, r[5] or 'NULL', fmt_text)
    ws2.write(row, 6, r[6] or '', fmt_text)
    ws2.write(row, 7, float(r[7]) if r[7] else 0, fmt_num)
    ws2.write(row, 8, r[8] or '', fmt_text)
    ws2.write(row, 9, 'SIM' if r[9] else 'NAO', fmt_text)
    row += 1
    count += 1

print(f"    {count} registros exportados")

# ============================================================
# ABA 3: RESUMO
# ============================================================
print("  Exportando RESUMO...")
ws3 = wb.add_worksheet('RESUMO')
ws3.set_column('A:A', 35)
ws3.set_column('B:C', 18)

ws3.merge_range('A1:C1', 'RESUMO - Base Banco de Dados', fmt_title)

row = 2
ws3.write(row, 0, 'Gerado em', fmt_text)
ws3.write(row, 1, datetime.now().strftime('%d/%m/%Y %H:%M'), fmt_text)
row += 2

# BASE PREST summary
ws3.merge_range(row, 0, row, 2, 'BASE PREST', wb.add_format({'bold': True, 'bg_color': '#D6E4F0'}))
row += 1
ws3.write(row, 0, 'Metrica', fmt_header)
ws3.write(row, 1, 'Valor', fmt_header)
row += 1

cur.execute("""
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status IS NOT NULL THEN 1 END) as with_status,
      COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status,
      SUM(value::numeric) as total_value
    FROM prestacao_expenses
""")
r = cur.fetchone()
ws3.write(row, 0, 'Total despesas', fmt_text); ws3.write(row, 1, r[0], fmt_text); row += 1
ws3.write(row, 0, 'Com status', fmt_text); ws3.write(row, 1, r[1], fmt_text); row += 1
ws3.write(row, 0, 'Status NULL', fmt_text); ws3.write(row, 1, r[2], fmt_text); row += 1
ws3.write(row, 0, 'Valor total', fmt_text); ws3.write(row, 1, float(r[3]) if r[3] else 0, fmt_num); row += 1

cur.execute("""
    SELECT status, COUNT(*) as count
    FROM prestacao_expenses
    GROUP BY status
    ORDER BY count DESC
""")
row += 1
ws3.write(row, 0, 'Status', fmt_header); ws3.write(row, 1, 'Count', fmt_header); row += 1
for r in cur.fetchall():
    ws3.write(row, 0, r[0] or 'NULL', fmt_text)
    ws3.write(row, 1, r[1], fmt_text)
    row += 1

row += 2

# EXTRATO summary
ws3.merge_range(row, 0, row, 2, 'EXTRATO', wb.add_format({'bold': True, 'bg_color': '#D6E4F0'}))
row += 1
ws3.write(row, 0, 'Metrica', fmt_header); ws3.write(row, 1, 'Valor', fmt_header); row += 1

cur.execute("""
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN is_snapshot = true THEN 1 END) as snapshot,
      COUNT(CASE WHEN is_snapshot = false THEN 1 END) as normal,
      SUM(valor::numeric) as total_value,
      MIN(data) as min_data,
      MAX(data) as max_data
    FROM extrato_movimentacao
""")
r = cur.fetchone()
ws3.write(row, 0, 'Total registros', fmt_text); ws3.write(row, 1, r[0], fmt_text); row += 1
ws3.write(row, 0, 'Snapshot (carga)', fmt_text); ws3.write(row, 1, r[1], fmt_text); row += 1
ws3.write(row, 0, 'Normal', fmt_text); ws3.write(row, 1, r[2], fmt_text); row += 1
ws3.write(row, 0, 'Valor total', fmt_text); ws3.write(row, 1, float(r[3]) if r[3] else 0, fmt_num); row += 1
ws3.write(row, 0, 'Data min', fmt_text); ws3.write(row, 1, str(r[4]) if r[4] else '', fmt_text); row += 1
ws3.write(row, 0, 'Data max', fmt_text); ws3.write(row, 1, str(r[5]) if r[5] else '', fmt_text); row += 1

cur.execute("""
    SELECT COALESCE(tipo, 'NULL') as tipo, COUNT(*) as count, SUM(valor::numeric) as sum
    FROM extrato_movimentacao
    GROUP BY COALESCE(tipo, 'NULL')
    ORDER BY sum DESC
""")
row += 1
ws3.write(row, 0, 'Tipo', fmt_header); ws3.write(row, 1, 'Count', fmt_header); ws3.write(row, 2, 'Sum', fmt_header); row += 1
for r in cur.fetchall():
    ws3.write(row, 0, r[0], fmt_text)
    ws3.write(row, 1, r[1], fmt_text)
    ws3.write(row, 2, float(r[2]) if r[2] else 0, fmt_num)
    row += 1

cur.close()
conn.close()

wb.close()
print(f"\nPlanilha gerada: {OUTPUT}")
print(f"Abas: BASE_PREST, EXTRATO, RESUMO")
