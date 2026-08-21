"""
Valida o arquivo gerado contra a planilha real, usando os valores manuais
(col_1qz e adiantamento) extraídos da própria planilha como input.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from src.gerar_carga_qz import gerar_carga, DB_PATH

def sf(v) -> float:
    try:
        return float(v) if v is not None and str(v).strip() not in ('', 'None') else 0.0
    except (ValueError, TypeError):
        return 0.0

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

# Extrai os valores manuais da planilha real para simular input real
carga_real = {
    r['cpf']: dict(r)
    for r in conn.execute("SELECT * FROM carga_1qz_planilha1").fetchall()
}
conn.close()

# Monta o dict de manuais com os valores reais da planilha
manuais = {
    cpf: {
        "col_1qz":    sf(r.get("col_1ª_qz")),
        "adiantamento": sf(r.get("adiantamento")),
        "obs":        r.get("obs"),
    }
    for cpf, r in carga_real.items()
}

# Gera com os manuais reais
linhas = gerar_carga(manuais=manuais, db_path=DB_PATH)
gerado = {r['cpf']: r for r in linhas}

TOL = 0.02
COLS = ['colaborador','situação','regional','centro_de_custo','gestor','diretor',
        'status_do_cartão','saldo_final','saldo_reembolsar','saldo_cartao',
        'reembolso','carga_parcial','carga_final']

stats = {c: {'ok': 0, 'diff': 0} for c in COLS}
divergencias = []

for cpf, real in carga_real.items():
    gen = gerado.get(cpf)
    if not gen:
        continue

    row_diffs = []
    for col in COLS:
        real_val = real.get(col)
        gen_val = gen.get(col)
        try:
            if abs(sf(real_val) - sf(gen_val)) <= TOL:
                stats[col]['ok'] += 1
            else:
                stats[col]['diff'] += 1
                row_diffs.append(f"{col}: gerado={sf(gen_val):.4f} real={sf(real_val):.4f} diff={sf(real_val)-sf(gen_val):+.4f}")
        except Exception:
            if str(real_val or '').strip().upper() == str(gen_val or '').strip().upper():
                stats[col]['ok'] += 1
            else:
                stats[col]['diff'] += 1
                row_diffs.append(f"{col}: gerado={gen_val!r} real={real_val!r}")

    if row_diffs:
        divergencias.append({'cpf': cpf, 'nome': real['colaborador'], 'diffs': row_diffs})

n = len(carga_real)
print(f"{'='*55}")
print(f"VALIDAÇÃO GERADOR vs PLANILHA REAL ({n} linhas)")
print(f"{'='*55}")
print(f"{'COLUNA':<22} {'OK':>5} {'DIFF':>5}  {'%OK':>6}")
print("-"*42)
for col in COLS:
    t = stats[col]
    pct = t['ok'] / n * 100 if n else 0
    flag = "✅" if t['diff'] == 0 else "❌"
    print(f"{flag} {col:<20} {t['ok']:>5} {t['diff']:>5}  {pct:>5.1f}%")

print(f"\nDivergências: {len(divergencias)} linhas")
for d in divergencias[:15]:
    print(f"\n  [{d['cpf']}] {d['nome']}")
    for diff in d['diffs']:
        print(f"    {diff}")
