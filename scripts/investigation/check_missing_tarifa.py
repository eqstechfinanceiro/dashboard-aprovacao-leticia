import openpyxl
import psycopg2
import warnings
warnings.filterwarnings('ignore')

PLANILHA = 'CONTROLE - VEXPENSES - AGOSTO 2026.xlsx'
DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

cpfs = {
    '02027745203': 'ABNER',
    '08247635992': 'JORGE LUIZ',
    '11178519740': 'GUILHERME MOTTA',
    '00041171071': 'JAFER',
    '72756284220': 'MARCO AURELIO ANDRADE',
    '02299450076': 'ALEKSANDER',
    '47514649816': 'LUCAS TAVARES',
}

print("Lendo planilha...")
wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)

ws = wb['EXTRATO']
rows_iter = ws.iter_rows(min_row=8, values_only=True)
header_row = next(rows_iter)
headers = {str(v).strip().lower(): i for i, v in enumerate(header_row) if v}

tipo_idx = headers.get('tipo', 9)
valor_idx = headers.get('valor', 11)
cpf_idx = headers.get('cpf', 12)
cod_idx = headers.get('código de transação', 5)

# Collect TARIFA codigos from planilha
planilha_codigos = {cpf: set() for cpf in cpfs}
for row in rows_iter:
    if row is None:
        continue
    cpf_val = str(row[cpf_idx] or '').strip() if cpf_idx < len(row) else ''
    if cpf_val not in cpfs:
        continue
    tipo_val = str(row[tipo_idx] or '').strip() if tipo_idx < len(row) else ''
    if tipo_val != 'TARIFA':
        continue
    cod_val = str(row[cod_idx] or '').strip() if cod_idx < len(row) else ''
    if cod_val:
        planilha_codigos[cpf_val].add(cod_val)

print("Conectando ao banco...")
conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

for cpf, name in cpfs.items():
    plan_codes = planilha_codigos.get(cpf, set())
    if not plan_codes:
        print(f"\n{name} ({cpf}): no TARIFA codigos in planilha")
        continue
    
    # Get banco codigos for this CPF - need to find usuario name from cadastro
    cur.execute("""
        SELECT DISTINCT e.codigo_transacao
        FROM extrato_movimentacao e
        WHERE e.is_snapshot = false
        AND e.tipo IN ('Taxa', 'Estorno de taxa')
        AND EXISTS (
            SELECT 1 FROM quinzena_cadastro c
            WHERE c.cpf = %s
            AND c.colaborador ILIKE e.usuario
        )
    """, (cpf,))
    banco_codes = {r[0] for r in cur.fetchall() if r[0]}
    
    missing_from_banco = plan_codes - banco_codes
    extra_in_banco = banco_codes - plan_codes
    
    print(f"\n{name} ({cpf}):")
    print(f"  Planilha TARIFA codigos: {len(plan_codes)}")
    print(f"  Banco Taxa/Estorno codigos: {len(banco_codes)}")
    print(f"  Missing from banco (in planilha but not banco): {len(missing_from_banco)}")
    for c in sorted(missing_from_banco):
        print(f"    {c}")
    print(f"  Extra in banco (in banco but not planilha): {len(extra_in_banco)}")
    for c in sorted(extra_in_banco):
        print(f"    {c}")

conn.close()
