import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# 1. Get all conferencia IDs that duplicate lince-automacao
cur.execute("""
  SELECT DISTINCT rn1.id
  FROM resultados_notas rn1
  JOIN resultados_notas rn2
    ON REGEXP_REPLACE(rn1.numero_nota, '^0+', '') = REGEXP_REPLACE(rn2.numero_nota, '^0+', '')
    AND rn1.data = rn2.data
    AND rn1.valor = rn2.valor
    AND rn1.id != rn2.id
  WHERE rn1.fonte IN ('conferencia-mercadoria', 'conferencia-servico')
  AND rn2.fonte = 'lince-automacao'
""")
conf_dup_ids = [r[0] for r in cur.fetchall()]
print(f"conferencia duplicates to delete: {len(conf_dup_ids)}")

# 2. Delete them in batches
for i in range(0, len(conf_dup_ids), 100):
    batch = conf_dup_ids[i:i+100]
    placeholders = ','.join(['%s'] * len(batch))
    cur.execute(f"DELETE FROM resultados_notas WHERE id IN ({placeholders})", batch)
    print(f"  Batch {i//100 + 1}: deleted {cur.rowcount}")

# 3. Normalize remaining Bratec -> BRATEC
cur.execute("UPDATE resultados_notas SET empresa = 'BRATEC' WHERE empresa = 'Bratec'")
print(f"\nNormalized Bratec -> BRATEC: {cur.rowcount} rows")

conn.commit()

# 4. Verify final state
cur.execute("SELECT empresa, COUNT(*) FROM resultados_notas GROUP BY empresa ORDER BY COUNT(*) DESC")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

cur.execute("SELECT COUNT(*) FROM resultados_notas")
total = cur.fetchone()[0]
print(f"\nTotal: {total}")

cur.close()
conn.close()
print("Done!")
