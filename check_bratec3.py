import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Match by trimming leading zeros from numero_nota + data + valor
cur.execute("""
  SELECT rn1.id as lower_id, rn1.empresa as lower_emp, rn1.numero_nota as lower_nota, 
         rn1.valor as lower_valor, rn1.titulo as lower_titulo,
         rn2.id as upper_id, rn2.empresa as upper_emp, rn2.numero_nota as upper_nota,
         rn2.valor as upper_valor, rn2.titulo as upper_titulo
  FROM resultados_notas rn1
  JOIN resultados_notas rn2
    ON REGEXP_REPLACE(rn1.numero_nota, '^0+', '') = REGEXP_REPLACE(rn2.numero_nota, '^0+', '')
    AND rn1.data = rn2.data
    AND rn1.valor = rn2.valor
    AND rn1.id != rn2.id
  WHERE rn1.empresa = 'Bratec'
  AND rn2.empresa = 'BRATEC'
  AND rn1.data = '2026-08-26'
  ORDER BY REGEXP_REPLACE(rn1.numero_nota, '^0+', '')
""")
rows = cur.fetchall()
print(f"Bratec (lower) matching BRATEC (upper) by trimmed numero_nota + data + valor: {len(rows)}")
for r in rows:
    print(f"  nota={r[2]}/{r[7]} | lower: id={r[0]} valor={r[3]} | upper: id={r[5]} valor={r[8]}")

# Count how many Bratec entries have NO match
cur.execute("""
  SELECT COUNT(*) FROM resultados_notas rn1
  WHERE rn1.empresa = 'Bratec' AND rn1.data = '2026-08-26'
  AND NOT EXISTS (
    SELECT 1 FROM resultados_notas rn2
    WHERE rn2.empresa = 'BRATEC'
    AND REGEXP_REPLACE(rn2.numero_nota, '^0+', '') = REGEXP_REPLACE(rn1.numero_nota, '^0+', '')
    AND rn2.data = rn1.data
    AND rn2.valor = rn1.valor
    AND rn2.id != rn1.id
  )
""")
no_match = cur.fetchone()[0]
print(f"\nBratec entries with no BRATEC match: {no_match}")

cur.close()
conn.close()
