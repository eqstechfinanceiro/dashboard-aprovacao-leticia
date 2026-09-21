import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Check remaining duplicates by trimmed numero_nota + data + valor
cur.execute("""
  SELECT REGEXP_REPLACE(numero_nota, '^0+', '') as nota, data, valor, COUNT(*) as cnt,
         array_agg(id) as ids, array_agg(empresa) as empresas, array_agg(fonte) as fontes
  FROM resultados_notas
  WHERE numero_nota IS NOT NULL AND numero_nota != ''
  GROUP BY REGEXP_REPLACE(numero_nota, '^0+', ''), data, valor
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
  LIMIT 20
""")
dups = cur.fetchall()
print(f"Remaining duplicate groups (trimmed nota + data + valor): {len(dups)}")
for r in dups:
    print(f"  nota={r[0]} data={r[1]} valor={r[2]} cnt={r[3]} ids={r[4]} empresas={r[5]} fontes={r[6]}")

# Check feita_pelo_bot distribution
cur.execute("""
  SELECT fonte, feita_pelo_bot, COUNT(*) 
  FROM resultados_notas 
  GROUP BY fonte, feita_pelo_bot 
  ORDER BY fonte, feita_pelo_bot
""")
print(f"\nfeita_pelo_bot distribution:")
for r in cur.fetchall():
    print(f"  fonte={r[0]} bot={r[1]} count={r[2]}")

cur.close()
conn.close()
