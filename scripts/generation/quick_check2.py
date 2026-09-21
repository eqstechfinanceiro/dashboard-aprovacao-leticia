import psycopg2
import openpyxl
import warnings
warnings.filterwarnings('ignore')

DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(DB_CONN)
cur = conn.cursor()

# Read exactly like gerar_comparacao.py does
cur.execute("""
    SELECT cpf, colaborador, carga::numeric, transferencia::numeric, tarifa::numeric,
           prestacao::numeric, saldo_cartao::numeric, saldo_prestacao::numeric,
           saldo_final::numeric, saldo_reembolsar::numeric
    FROM quinzena_frozen_snapshots
    WHERE year = 2026 AND month = 8 AND quinzena = 2
    ORDER BY colaborador
""")

for r in cur.fetchall():
    cpf = str(r[0]).strip()
    if cpf in ('08247635992', '02027745203', '11178519740'):
        print(f"  {cpf} {r[1]}: tarifa={r[4]}")

cur.close()
conn.close()
