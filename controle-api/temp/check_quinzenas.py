import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

print('=== 1ª QZ MAIO 2026 (primeiros 3) ===')
rows = conn.execute("SELECT cpf, colaborador, valor, quinzena FROM controle_quinzenas WHERE [mês]='MAIO' AND ano='2026.0' AND quinzena='1ª QZ' LIMIT 3").fetchall()
for r in rows: print(dict(r))

print()
print('=== 2ª QZ MAIO 2026 (primeiros 3) ===')
rows = conn.execute("SELECT cpf, colaborador, valor, quinzena FROM controle_quinzenas WHERE [mês]='MAIO' AND ano='2026.0' AND quinzena='2ª QZ' LIMIT 3").fetchall()
for r in rows: print(dict(r))

print()
r1 = conn.execute("SELECT COUNT(*) FROM controle_quinzenas WHERE [mês]='MAIO' AND ano='2026.0' AND quinzena='1ª QZ'").fetchone()[0]
r2 = conn.execute("SELECT COUNT(*) FROM controle_quinzenas WHERE [mês]='MAIO' AND ano='2026.0' AND quinzena='2ª QZ'").fetchone()[0]
print(f'Contagens — 1ª QZ: {r1} | 2ª QZ: {r2}')

# Verifica se os valores da 1a e 2a QZ são iguais para os mesmos CPFs
print()
print('=== Comparação 1ª vs 2ª QZ (mesmo CPF) ===')
rows = conn.execute("""
    SELECT a.cpf, a.colaborador, a.valor as val_1qz, b.valor as val_2qz
    FROM controle_quinzenas a
    JOIN controle_quinzenas b ON a.cpf = b.cpf AND b.[mês]='MAIO' AND b.ano='2026.0' AND b.quinzena='2ª QZ'
    WHERE a.[mês]='MAIO' AND a.ano='2026.0' AND a.quinzena='1ª QZ'
    LIMIT 5
""").fetchall()
for r in rows: print(dict(r))

conn.close()
