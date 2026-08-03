"""Verify consistency using the same is_fatura_or_cartao filter as the actual code."""
import os, re, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def is_fatura_or_cartao(name: str) -> bool:
    n = (name or '').strip().upper()
    if not n:
        return False
    if 'CAIXA ITAU' in n or 'CAIXA ITAÚ' in n:
        return True
    if n.startswith('CAIXA'):
        return False
    if re.match(r'^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)', n):
        return True
    if 'CARTÃO DE CRÉDITO' in n or 'CARTAO DE CREDITO' in n or 'CARTÃO DE CREDITO' in n:
        return True
    if 'CARTÃO CORPORATIVO' in n:
        return True
    if ('ITAU' in n or 'ITAÚ' in n) and 'CAIXA' not in n:
        return True
    if 'DOLAR' in n or 'DÓLAR' in n:
        return True
    if n.startswith('DESPESA') and 'FATURA' in n:
        return True
    if n.startswith('COMPLEMENTAR') and 'FATURA' in n:
        return True
    if 'CARTÃO' in n and 'CRÉDITO' in n:
        return True
    if 'CARTAO' in n and 'CREDITO' in n:
        return True
    if n.startswith('CARTÃO VEXPENSES'):
        return True
    return False


# 1. Live calc matching quinzena-complete route exactly (name filter + pm_id filter, no cutoff)
cur.execute("""
    SELECT r.id, r.name, r.user_cpf
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
""")
all_reports = cur.fetchall()
valid_ids = [r["id"] for r in all_reports if not is_fatura_or_cartao(r["name"] or "")]
excluded_ids = [r["id"] for r in all_reports if is_fatura_or_cartao(r["name"] or "")]

print(f"Reports: {len(all_reports)} total, {len(excluded_ids)} FATURA/CARTAO excluded, {len(valid_ids)} valid")

cur.execute("""
    SELECT pr.user_cpf, SUM(pe.value) as total
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.id = ANY(%s::bigint[])
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    GROUP BY pr.user_cpf
""", (valid_ids,))
live_rows = cur.fetchall()
live_total = sum(r["total"] for r in live_rows)
print(f"\n1. Live calc (name+pm_id filter, no cutoff): {len(live_rows)} CPFs, R$ {live_total:,.2f}")

# 2. Snapshot 2026-07-2 (name+pm_id filter, with cutoff 2026-08-10)
cur.execute("SELECT COUNT(*) as cnt, SUM(total) as t FROM somase_snapshots WHERE quinzena = '2026-07-2'")
row = cur.fetchone()
print(f"2. Snapshot 2026-07-2: {row['cnt']} CPFs, R$ {row['t']:,.2f}")

# 3. Difference
diff = live_total - (row['t'] or 0)
print(f"\nDifference: R$ {diff:,.2f} ({len(live_rows) - row['cnt']} CPFs)")

# 4. Check what's in live but not in snapshot (reports with approval_date > cutoff)
cur.execute("""
    SELECT r.id, r.name, r.user_cpf, r.raw_data->>'approval_date' as approval_date
    FROM prestacao_reports r
    WHERE r.id = ANY(%s::bigint[])
      AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) > '2026-08-10 23:59:59'
""", (valid_ids,))
late_reports = cur.fetchall()
print(f"\n3. Reports with approval_date > cutoff (2026-08-10): {len(late_reports)}")
for r in late_reports[:10]:
    print(f"   id={r['id']}, name={r['name']}, approval_date={r['approval_date']}")

# 5. Check reports with NULL approval_date
cur.execute("""
    SELECT r.id, r.name, r.user_cpf, r.raw_data->>'approval_date' as approval_date
    FROM prestacao_reports r
    WHERE r.id = ANY(%s::bigint[])
      AND r.raw_data->>'approval_date' IS NULL
      AND r.updated_at IS NULL
""")
null_date_reports = cur.fetchall()
print(f"\n4. Reports with NULL approval_date AND NULL updated_at: {len(null_date_reports)}")
for r in null_date_reports[:10]:
    print(f"   id={r['id']}, name={r['name']}")

conn.close()
