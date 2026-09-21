import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# IDs to delete: 50 Bratec (lower) entries that duplicate BRATEC (upper)
# Plus the internal lince-automacao duplicate (id 100769, keeping 100412)
ids_to_delete = [
    100413, 100438, 100752, 100415, 100434, 100435, 100425, 100437, 100441,
    100430, 100421, 100763, 100762, 100470, 100428, 100408, 100409, 100439,
    100440, 100436, 100758, 100755, 100767, 100766, 100768, 100761, 100427,
    100414, 100426, 100424, 100753, 100431, 100410, 100419, 100756, 100754,
    100442, 100760, 100417, 100416, 100420, 100418, 100429, 100764, 100725,
    100666, 100757, 100759, 100432, 100433,
    100769,  # internal lince-automacao duplicate of id 100412 (nota 4103)
]

print(f"Deleting {len(ids_to_delete)} duplicate entries...")

# Delete in batches
for i in range(0, len(ids_to_delete), 50):
    batch = ids_to_delete[i:i+50]
    placeholders = ','.join(['%s'] * len(batch))
    cur.execute(f"DELETE FROM resultados_notas WHERE id IN ({placeholders})", batch)
    deleted = cur.rowcount
    print(f"  Batch {i//50 + 1}: deleted {deleted} rows")

conn.commit()

# Verify
cur.execute("SELECT COUNT(*) FROM resultados_notas WHERE empresa = 'Bratec'")
remaining = cur.fetchone()[0]
print(f"\nRemaining 'Bratec' (lower) entries: {remaining}")

cur.execute("SELECT COUNT(*) FROM resultados_notas")
total = cur.fetchone()[0]
print(f"Total entries now: {total}")

cur.close()
conn.close()
print("Done!")
