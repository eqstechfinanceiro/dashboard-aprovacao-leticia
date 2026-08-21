"""
Validação completa: recalcula todas as colunas automáticas da carga_1qz
e compara linha a linha com a planilha real no banco.
"""
import sqlite3
from dataclasses import dataclass, field
from typing import Optional

def sf(v) -> float:
    try:
        return float(v) if v is not None and str(v).strip() not in ('', 'None') else 0.0
    except (ValueError, TypeError):
        return 0.0

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# --- Carregar fontes ---
painel = {r['cpf']: dict(r) for r in conn.execute("SELECT * FROM controle_painel").fetchall()}

# saldo_cartao: pode haver múltiplos registros por CPF, pegar o mais recente (maior data)
sc_rows = conn.execute("SELECT cpf, valor, data FROM controle_saldo_cartao_resumo").fetchall()
saldo_cartao_map: dict[str, float] = {}
saldo_cartao_data: dict[str, float] = {}
for row in sc_rows:
    cpf = row['cpf']
    data_val = sf(row['data'])
    if cpf not in saldo_cartao_data or data_val > saldo_cartao_data[cpf]:
        saldo_cartao_data[cpf] = data_val
        saldo_cartao_map[cpf] = sf(row['valor'])

# --- Carga real ---
carga_rows = conn.execute("SELECT * FROM carga_1qz_planilha1 ORDER BY colaborador").fetchall()

TOLERANCE = 0.02

cols_to_check = [
    'colaborador', 'situação', 'regional', 'centro_de_custo',
    'gestor', 'diretor', 'status_do_cartão',
    'saldo_final', 'saldo_reembolsar', 'saldo_cartao',
    'reembolso', 'carga_parcial', 'carga_final',
]

totals = {c: {'ok': 0, 'diff': 0, 'missing_src': 0} for c in cols_to_check}
divergencias = []

for row in carga_rows:
    cpf = row['cpf']
    p = painel.get(cpf)
    real = dict(row)

    if not p:
        for c in cols_to_check:
            totals[c]['missing_src'] += 1
        divergencias.append({'cpf': cpf, 'nome': real['colaborador'], 'erro': 'SEM PAINEL'})
        continue

    # --- Calcular valores esperados ---
    painel_saldo_final = sf(p.get('saldo_final'))
    saldo_reembolsar_calc = abs(painel_saldo_final) if painel_saldo_final < 0 else 0.0
    saldo_final_calc = max(painel_saldo_final, 0.0)  # se negativo → 0 na carga
    saldo_cartao_calc = saldo_cartao_map.get(cpf, 0.0)
    reembolso_calc = round(saldo_reembolsar_calc / 2, 10)

    col_1qz = sf(real.get('col_1ª_qz'))
    adiantamento = sf(real.get('adiantamento'))

    carga_parcial_calc = col_1qz - saldo_final_calc - saldo_cartao_calc + reembolso_calc - adiantamento
    carga_final_calc = carga_parcial_calc + adiantamento if carga_parcial_calc >= 0 else 0.0
    # Ajuste: quando carga_parcial < 0 → carga_final = 0 (a pagar na 2QZ)
    # Quando carga_parcial > 0 → carga_final = carga_parcial (devolução)

    expected = {
        'colaborador':    p.get('colaborador', ''),
        'situação':       p.get('situação', ''),
        'regional':       p.get('regional', ''),
        'centro_de_custo': p.get('centro_de_custo', ''),
        'gestor':         p.get('gestor', ''),
        'diretor':        p.get('diretor', ''),
        'status_do_cartão': p.get('status_do_cartão', ''),
        'saldo_final':    saldo_final_calc,
        'saldo_reembolsar': saldo_reembolsar_calc,
        'saldo_cartao':   saldo_cartao_calc,
        'reembolso':      reembolso_calc,
        'carga_parcial':  carga_parcial_calc,
        'carga_final':    carga_final_calc,
    }

    row_diffs = []
    for col in cols_to_check:
        real_val = real.get(col)
        exp_val = expected[col]

        # Comparação numérica
        try:
            real_f = sf(real_val)
            exp_f = float(exp_val)
            if abs(real_f - exp_f) <= TOLERANCE:
                totals[col]['ok'] += 1
            else:
                totals[col]['diff'] += 1
                row_diffs.append(f"{col}: esperado={exp_f:.4f} real={real_f:.4f} diff={real_f-exp_f:.4f}")
        except (ValueError, TypeError):
            # Comparação texto
            real_s = str(real_val or '').strip().upper()
            exp_s = str(exp_val or '').strip().upper()
            if real_s == exp_s:
                totals[col]['ok'] += 1
            else:
                totals[col]['diff'] += 1
                row_diffs.append(f"{col}: esperado={exp_s!r} real={real_s!r}")

    if row_diffs:
        divergencias.append({'cpf': cpf, 'nome': real['colaborador'], 'diffs': row_diffs})

# --- Relatório ---
total_rows = len(carga_rows)
print(f"{'='*65}")
print(f"VALIDAÇÃO CARGA QZ — {total_rows} colaboradores")
print(f"{'='*65}")
print(f"\n{'COLUNA':<22} {'OK':>6} {'DIFF':>6} {'SEM_SRC':>8} {'%OK':>6}")
print("-" * 52)
for col in cols_to_check:
    t = totals[col]
    pct = t['ok'] / total_rows * 100 if total_rows else 0
    flag = "✅" if t['diff'] == 0 and t['missing_src'] == 0 else "❌"
    print(f"{flag} {col:<20} {t['ok']:>6} {t['diff']:>6} {t['missing_src']:>8} {pct:>5.1f}%")

print(f"\n{'='*65}")
print(f"DIVERGÊNCIAS DETALHADAS ({len(divergencias)} linhas com diferença)")
print(f"{'='*65}")
for d in divergencias[:30]:
    print(f"\n  [{d['cpf']}] {d['nome']}")
    if 'erro' in d:
        print(f"    ERRO: {d['erro']}")
    else:
        for diff in d.get('diffs', []):
            print(f"    {diff}")

if len(divergencias) > 30:
    print(f"\n  ... e mais {len(divergencias) - 30} linhas com divergência")
