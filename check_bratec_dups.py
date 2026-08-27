import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# 1. Find all Bratec (lowercase) entries that duplicate BRATEC (uppercase) by numero_nota + data + valor
cur.execute("""
  SELECT rn1.id, rn1.empresa, rn1.numero_nota, rn1.titulo, rn1.valor, rn1.data, rn1.fonte,
         rn2.id as upper_id, rn2.empresa as upper_emp
  FROM resultados_notas rn1
  JOIN resultados_notas rn2
    ON rn1.numero_nota = rn2.numero_nota
    AND rn1.data = rn2.data
    AND rn1.valor = rn2.valor
    AND rn1.id != rn2.id
  WHERE rn1.empresa = 'Bratec'
  AND rn2.empresa = 'BRATEC'
  ORDER BY rn1.numero_nota
""")
rows = cur.fetchall()
print(f"Bratec (lower) duplicating BRATEC (upper): {len(rows)} entries")
for r in rows:
    print(f"  id={r[0]} emp={r[1]} nota={r[2]} valor={r[4]} data={r[5]} | upper id={r[7]} emp={r[8]}")

# 2. Also check if Bratec entries exist without BRATEC match (standalone)
cur.execute("""
  SELECT rn1.id, rn1.empresa, rn1.numero_nota, rn1.titulo, rn1.valor, rn1.data, rn1.fonte
  FROM resultados_notas rn1
  WHERE rn1.empresa = 'Bratec'
  AND NOT EXISTS (
    SELECT 1 FROM resultados_notas rn2
    WHERE rn2.numero_nota = rn1.numero_nota
    AND rn2.data = rn1.data
    AND rn2.valor = rn1.valor
    AND rn2.empresa = 'BRATEC'
    AND rn2.id != rn1.id
  )
  ORDER BY rn1.numero_nota
""")
standalone = cur.fetchall()
print(f"\nStandalone Bratec (no BRATEC match): {len(standalone)} entries")
for r in standalone:
    print(f"  id={r[0]} nota={r[2]} titulo={r[3]} valor={r[4]} data={r[5]} fonte={r[6]}")

# 3. Total Bratec entries
cur.execute("SELECT COUNT(*) FROM resultados_notas WHERE empresa = 'Bratec'")
total_bratec = cur.fetchone()[0]
print(f"\nTotal Bratec (lower): {total_bratec}")

cur.execute("SELECT COUNT(*) FROM resultados_notas WHERE empresa = 'BRATEC' AND data = '2026-08-26'")
total_upper_today = cur.fetchone()[0]
print(f"Total BRATEC (upper) today: {total_upper_today}")

cur.close()
conn.close()
