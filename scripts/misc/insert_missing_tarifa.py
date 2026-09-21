import psycopg2
import openpyxl
import warnings
from datetime import datetime, timedelta
warnings.filterwarnings('ignore')

DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
PLANILHA = 'CONTROLE - VEXPENSES - AGOSTO 2026.xlsx'

missing_codes = {
    '2C1829A64681002E5636D17C4C85D09C', '53B3229B59B6F3EF8B18E9B784480A01',
    '1271F9ADA44C34BF9B9F74A8973F358D', 'D0F2037A63CFDB83E8007AEC1C367DB4',
    'E7A70F19EE1B9902E031ACB39C76891E', '5BE549C9FE239179BFF0EAF8CF470C55',
    '88B7FCA3CBC6281F441E6DC65179037E', 'A51439FC968746B4DC8A76E60D40A23C',
    'F3F69EE0A3072B08F37E6AF8F766E364', '3F336164586CFC4AD516CEE8354AAA8C',
    '208E5BA7196F932E0733EB676F1A85E6', '9F0F1C61E7E6F4F636F967834BE4D4BC',
    '212C3D05D728847CBAC1C60444F2F105', '7ABD93F08BE2120D2D1306132D6548EC',
    '77D17B1E01FCD933209BE915223F9191', '5AF49CCF32FBA587E6B3A866FA862461',
    '8B3268CBE4B4C60F994B171EB803C3BC', '56AAC64FDD895AFD03463067EA0D6EEB',
    '8721A01152C5F8F94B0557FC6187FFA3', 'C7FB84F4623D2099E78D5308F11251F4',
    'F5F83588980CDE098885997E1A8BBEEF', '233B20A64CD9E9FADB9BA0E22778ECEF',
    'D684D8358D66C483D8AE7ED6E3801B01', '5DDF5415400FDBF7F11A0DC64F2D3CB2',
    '3F9DECB7C47979C995ED1749359F294E', '64400917DB3A97DB37C1B7448744D9DF',
    'D2F0E6F3D6C3D94E3299BED09F8A4451', '8A6CB77CCC4FBC486095CA631FBA1550',
    '4AC24107ABA8C191ABE4D072DA96358E', 'E66660CDA981CEB3BC6B60B3E780DF88',
    '237D475469E7EF47641BBC5CE5F79E9E',
}

def excel_serial_to_date(serial):
    if isinstance(serial, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=serial)).strftime('%Y-%m-%d')
    if isinstance(serial, datetime):
        return serial.strftime('%Y-%m-%d')
    return str(serial)

print("Reading planilha EXTRATO...")
wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)
ws = wb['EXTRATO']

rows_iter = ws.iter_rows(min_row=8, values_only=True)
header_row = next(rows_iter)
headers = {str(v).strip().lower(): i for i, v in enumerate(header_row) if v}

tipo_idx = headers.get('tipo', 9)
valor_idx = headers.get('valor', 11)
cod_idx = headers.get('código de transação', 5)
desc_idx = headers.get('descrição', 10)
data_idx = headers.get('data', 3)
hora_idx = headers.get('hora', 4)
user_idx = headers.get('usuário', 8)

entries = []
for row in rows_iter:
    if row is None:
        continue
    cod_val = str(row[cod_idx] or '').strip() if cod_idx < len(row) else ''
    if cod_val in missing_codes:
        data_val = excel_serial_to_date(row[data_idx]) if data_idx < len(row) else None
        hora_val = str(row[hora_idx] or '').strip() if hora_idx < len(row) else None
        user_val = str(row[user_idx] or '').strip() if user_idx < len(row) else ''
        desc_val = str(row[desc_idx] or '').strip() if desc_idx < len(row) else ''
        valor_val = row[valor_idx] if valor_idx < len(row) else None
        if isinstance(valor_val, str):
            valor_val = float(valor_val.replace('.', '').replace(',', '.'))
        entries.append((data_val, hora_val or None, cod_val, user_val, 'Taxa', desc_val, valor_val))
        print(f"  Found: {cod_val} {desc_val} {data_val} {valor_val}")

print(f"\nTotal from planilha: {len(entries)}")

print("\nConnecting to banco...")
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

inserted = 0
skipped = 0
for data_val, hora_val, cod, user, tipo, desc, valor in entries:
    cur.execute("SELECT 1 FROM extrato_movimentacao WHERE codigo_transacao = %s LIMIT 1", (cod,))
    if cur.fetchone():
        print(f"  SKIP (exists): {cod}")
        skipped += 1
        continue
    cur.execute("""
        INSERT INTO extrato_movimentacao
        (data, hora, codigo_transacao, usuario, tipo, descricao, valor, is_snapshot)
        VALUES (%s, %s, %s, %s, %s, %s, %s, false)
    """, (data_val, hora_val, cod, user, tipo, desc, valor))
    inserted += 1
    print(f"  INSERTED: {cod} {desc} {data_val} {valor}")

conn.commit()
cur.close()
conn.close()
print(f"\n=== DONE === Inserted: {inserted}, Skipped: {skipped}")
