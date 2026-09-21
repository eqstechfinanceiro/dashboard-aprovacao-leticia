import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Check remaining Bratec entries
cur.execute("SELECT id, numero_nota, titulo, valor, data, fonte FROM resultados_notas WHERE empresa = 'Bratec'")
rows = cur.fetchall()
print(f"Remaining 'Bratec' entries: {len(rows)}")
for r in rows:
    print(f"  id={r[0]} nota={r[1]} titulo={r[2]} valor={r[3]} data={r[4]} fonte={r[5]}")

# Now check: conferencia-mercadoria + conferencia-servico duplicating lince-automacao
# by trimmed numero_nota + data + valor
cur.execute("""
  SELECT rn1.id as conf_id, rn1.fonte as conf_fonte, rn1.numero_nota as conf_nota,
         rn2.id as lince_id, rn2.numero_nota as lince_nota, rn2.titulo as lince_titulo,
         rn1.data, rn1.valor
  FROM resultados_notas rn1
  JOIN resultados_notas rn2
    ON REGEXP_REPLACE(rn1.numero_nota, '^0+', '') = REGEXP_REPLACE(rn2.numero_nota, '^0+', '')
    AND rn1.data = rn2.data
    AND rn1.valor = rn2.valor
    AND rn1.id != rn2.id
  WHERE rn1.fonte IN ('conferencia-mercadoria', 'conferencia-servico')
  AND rn2.fonte = 'lince-automacao'
  ORDER BY rn1.data DESC
""")
dups = cur.fetchall()
print(f"\nconferencia entries duplicating lince-automacao: {len(dups)}")
conf_ids = set()
for r in dups:
    conf_ids.add(r[0])
    if dups.index(r) < 10:
        print(f"  conf_id={r[0]} fonte={r[1]} nota={r[2]} | lince_id={r[3]} nota={r[4]} titulo={r[5]} valor={r[7]}")

print(f"\nTotal conferencia IDs to delete: {len(conf_ids)}")

# Also check: are there conferencia entries that DON'T match lince? (standalone)
cur.execute("""
  SELECT COUNT(*) FROM resultados_notas rn1
  WHERE rn1.fonte IN ('conferencia-mercadoria', 'conferencia-servico')
  AND NOT EXISTS (
    SELECT 1 FROM resultados_notas rn2
    WHERE rn2.fonte = 'lince-automacao'
    AND REGEXP_REPLACE(rn2.numero_nota, '^0+', '') = REGEXP_REPLACE(rn1.numero_nota, '^0+', '')
    AND rn2.data = rn1.data
    AND rn2.valor = rn1.valor
    AND rn2.id != rn1.id
  )
""")
standalone = cur.fetchone()[0]
print(f"Standalone conferencia entries (no lince match): {standalone}")

cur.close()
conn.close()
