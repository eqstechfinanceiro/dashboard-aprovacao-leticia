"""
Validação v3: corrige saldo_final (max(painel_sf, 0)) e revalida tudo.
Também investiga os casos anômalos onde a lógica max() não basta.
"""
import sqlite3

def sf(v) -> float:
    try:
        return float(v) if v is not None and str(v).strip() not in ('', 'None') else 0.0
    except (ValueError, TypeError):
        return 0.0

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

painel = {r['cpf']: dict(r) for r in conn.execute("SELECT * FROM controle_painel").fetchall()}
sc_rows = conn.execute("SELECT cpf, valor, data FROM controle_saldo_cartao_resumo").fetchall()
saldo_cartao_map: dict = {}
saldo_cartao_data: dict = {}
for row in sc_rows:
    cpf = row['cpf']
    data_val = sf(row['data'])
    if cpf not in saldo_cartao_data or data_val > saldo_cartao_data[cpf]:
        saldo_cartao_data[cpf] = data_val
        saldo_cartao_map[cpf] = sf(row['valor'])

carga_rows = conn.execute("SELECT * FROM carga_1qz_planilha1 ORDER BY colaborador").fetchall()
TOL = 0.02

stats = {c: {'ok': 0, 'diff': 0} for c in [
    'colaborador','situação','regional','centro_de_custo','gestor','diretor',
    'status_do_cartão','saldo_final','saldo_reembolsar','saldo_cartao',
    'reembolso','carga_parcial','carga_final'
]}
anomalias = []
divergencias = []

for row in carga_rows:
    cpf = row['cpf']
    p = painel.get(cpf)
    if not p:
        continue

    real = dict(row)
    painel_sf = sf(p.get('saldo_final'))

    # Regras confirmadas:
    saldo_final_calc = max(painel_sf, 0.0)
    saldo_reembolsar_calc = abs(painel_sf) if painel_sf < 0 else 0.0
    saldo_cartao_calc = saldo_cartao_map.get(cpf, 0.0)
    reembolso_calc = round(saldo_reembolsar_calc / 2, 10)
    col_1qz = sf(real.get('col_1ª_qz'))
    adiantamento = sf(real.get('adiantamento'))

    # Fórmula B confirmada
    carga_parcial_calc = col_1qz - saldo_final_calc - saldo_cartao_calc - adiantamento

    # carga_final: quando carga_parcial > 0 = devolução, quando < 0 = 0
    if carga_parcial_calc > TOL:
        carga_final_calc = carga_parcial_calc
    else:
        carga_final_calc = 0.0

    expected = {
        'colaborador':     p.get('colaborador', ''),
        'situação':        p.get('situação', ''),
        'regional':        p.get('regional', ''),
        'centro_de_custo': p.get('centro_de_custo', ''),
        'gestor':          p.get('gestor', ''),
        'diretor':         p.get('diretor', ''),
        'status_do_cartão': p.get('status_do_cartão', ''),
        'saldo_final':     saldo_final_calc,
        'saldo_reembolsar': saldo_reembolsar_calc,
        'saldo_cartao':    saldo_cartao_calc,
        'reembolso':       reembolso_calc,
        'carga_parcial':   carga_parcial_calc,
        'carga_final':     carga_final_calc,
    }

    row_diffs = []
    for col, exp_val in expected.items():
        real_val = real.get(col)
        try:
            real_f = sf(real_val)
            exp_f = float(exp_val)
            if abs(real_f - exp_f) <= TOL:
                stats[col]['ok'] += 1
            else:
                stats[col]['diff'] += 1
                row_diffs.append(f"{col}: calc={exp_f:.4f} real={real_f:.4f} diff={real_f-exp_f:+.4f}")
        except (ValueError, TypeError):
            real_s = str(real_val or '').strip().upper()
            exp_s = str(exp_val or '').strip().upper()
            if real_s == exp_s:
                stats[col]['ok'] += 1
            else:
                stats[col]['diff'] += 1
                row_diffs.append(f"{col}: calc={exp_s!r} real={real_s!r}")

    if row_diffs:
        divergencias.append({'cpf': cpf, 'nome': real['colaborador'], 'diffs': row_diffs,
                             'painel_sf': painel_sf, 'real_sf': sf(real['saldo_final'])})

n = len(carga_rows)
print(f"{'='*60}")
print(f"VALIDAÇÃO FINAL — {n} colaboradores")
print(f"{'='*60}")
print(f"{'COLUNA':<22} {'OK':>5} {'DIFF':>5}  {'%OK':>6}")
print("-"*40)
for col in stats:
    t = stats[col]
    pct = t['ok'] / n * 100
    flag = "✅" if t['diff'] == 0 else "❌"
    print(f"{flag} {col:<20} {t['ok']:>5} {t['diff']:>5}  {pct:>5.1f}%")

print(f"\n{'='*60}")
print(f"DIVERGÊNCIAS ({len(divergencias)} linhas)")
print(f"{'='*60}")
for d in divergencias:
    print(f"\n  [{d['cpf']}] {d['nome']}")
    print(f"  painel.saldo_final={d['painel_sf']:.2f}  real.saldo_final={d['real_sf']:.2f}")
    for diff in d['diffs']:
        print(f"    {diff}")
