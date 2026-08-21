import psycopg2
import json

DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Check null payment_method_name - what reports are they from?
cur.execute("""
    SELECT r.name, r.status, COUNT(*) as cnt
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE e.raw_data->>'payment_method_name' IS NULL
    GROUP BY r.name, r.status
    ORDER BY cnt DESC
    LIMIT 20
""")
print("=== Reports with NULL payment_method_name ===")
for row in cur.fetchall():
    print(f"  {row[0]} ({row[1]}): {row[2]}")

# Total EXCLUDING Itau (and nulls)
cur.execute("""
    SELECT COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTAO%')
      AND COALESCE(e.raw_data->>'payment_method_name', '') NOT IN ('Cartao Corporativo Itau')
""")
total_excl_itau = cur.fetchone()[0]
print(f"\nTotal EXCLUDING Itau: R$ {total_excl_itau:,.2f}")

# Total including everything
cur.execute("""
    SELECT COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTAO%')
""")
total_with_itau = cur.fetchone()[0]
print(f"Total INCLUDING Itau: R$ {total_with_itau:,.2f}")
print(f"Itau expenses value: R$ {total_with_itau - total_excl_itau:,.2f}")

# NULL payment method value
cur.execute("""
    SELECT COALESCE(SUM(e.value), 0) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTAO%')
      AND e.raw_data->>'payment_method_name' IS NULL
""")
total_null = cur.fetchone()[0]
print(f"NULL payment method value: R$ {total_null:,.2f}")

# Check payment_method_id for nulls
cur.execute("""
    SELECT raw_data->>'payment_method_id' as pmid, COUNT(*) as cnt
    FROM prestacao_expenses
    WHERE raw_data->>'payment_method_name' IS NULL
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
""")
print("\n=== payment_method_id for NULL name ===")
for row in cur.fetchall():
    print(f"  id={row[0]}: {row[1]}")

# Now check: using ONLY allowed payment methods
allowed = ['Sem forma de pagamento', 'Cartão VExpenses', 'Desconto Colaborador',
           'Pix VExpenses', 'Recurso Próprio', 'Saque VExpenses', 'Tarifa de Saque']
# Note: DB might have slightly different spelling
cur.execute("""
    SELECT raw_data->>'payment_method_name' as pmn, COUNT(*) as cnt, COALESCE(SUM(value), 0) as total
    FROM prestacao_expenses
    GROUP BY 1
    ORDER BY cnt DESC
""")
print("\n=== Full payment_method_name distribution with values ===")
for row in cur.fetchall():
    print(f"  '{row[0]}': {row[1]} expenses, R$ {row[2]:,.2f}")

# Check with allowed list (using exact names from DB)
cur.execute("""
    SELECT COALESCE(SUM(e.value), 0) as total, COUNT(*) as cnt
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON r.id = e.report_id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTAO%')
      AND e.raw_data->>'payment_method_name' IN (
        'Saque VExpenses', 'Cartao VExpenses', 'Recurso Proprio',
        'Pix VExpenses', 'Tarifa de Saque'
      )
""")
row = cur.fetchone()
print(f"\nTotal with ONLY allowed payment methods: R$ {row[0]:,.2f} ({row[1]} expenses)")

# Check what 'Sem forma de pagamento' and 'Desconto Colaborador' look like in DB
cur.execute("""
    SELECT DISTINCT raw_data->>'payment_method_name'
    FROM prestacao_expenses
    WHERE raw_data->>'payment_method_name' ILIKE '%sem%'
       OR raw_data->>'payment_method_name' ILIKE '%desconto%'
       OR raw_data->>'payment_method_name' ILIKE '%proprio%'
       OR raw_data->>'payment_method_name' ILIKE '%próprio%'
""")
print("\n=== Matching payment method names ===")
for row in cur.fetchall():
    print(f"  '{row[0]}'")

cur.close()
conn.close()
