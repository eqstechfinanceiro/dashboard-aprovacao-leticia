import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Match Bratec vs BRATEC by numero_nota + data only (ignore valor)
cur.execute("""
  SELECT rn1.id as lower_id, rn1.empresa as lower_emp, rn1.numero_nota, 
         rn1.titulo as lower_titulo, rn1.valor as lower_valor, rn1.fornecedor_codigo as lower_forn,
         rn2.id as upper_id, rn2.empresa as upper_emp, 
         rn2.titulo as upper_titulo, rn2.valor as upper_valor, rn2.fornecedor_codigo as upper_forn
  FROM resultados_notas rn1
  JOIN resultados_notas rn2
    ON rn1.numero_nota = rn2.numero_nota
    AND rn1.data = rn2.data
    AND rn1.id != rn2.id
  WHERE rn1.empresa = 'Bratec'
  AND rn2.empresa = 'BRATEC'
  AND rn1.data = '2026-08-26'
  ORDER BY rn1.numero_nota
""")
rows = cur.fetchall()
print(f"Bratec (lower) matching BRATEC (upper) by numero_nota + data: {len(rows)}")
for r in rows:
    print(f"  nota={r[2]} | lower: id={r[0]} valor={r[4]} forn={r[5]} | upper: id={r[6]} valor={r[8]} forn={r[9]}")

# Also check: are there BRATEC entries today that DON'T match any Bratec?
cur.execute("""
  SELECT rn2.id, rn2.numero_nota, rn2.titulo, rn2.valor, rn2.fornecedor_codigo
  FROM resultados_notas rn2
  WHERE rn2.empresa = 'BRATEC'
  AND rn2.data = '2026-08-26'
  AND NOT EXISTS (
    SELECT 1 FROM resultados_notas rn1
    WHERE rn1.empresa = 'Bratec'
    AND rn1.numero_nota = rn2.numero_nota
    AND rn1.data = rn2.data
    AND rn1.id != rn2.id
  )
  ORDER BY rn2.numero_nota
""")
standalone_upper = cur.fetchall()
print(f"\nBRATEC (upper) today without Bratec match: {len(standalone_upper)}")
for r in standalone_upper:
    print(f"  id={r[0]} nota={r[1]} titulo={r[2]} valor={r[3]} forn={r[4]}")

cur.close()
conn.close()
