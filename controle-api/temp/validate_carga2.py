"""
Validação v2: testa variações da fórmula de carga_parcial e carga_final.
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

# Testar variações da fórmula de carga_parcial
# A suspeita é que reembolso NÃO entra no cálculo de carga_parcial
formulas = {
    'A: 1qz - sf - sc + reimb - ad':  lambda qz, sf_, sc, reimb, ad: qz - sf_ - sc + reimb - ad,
    'B: 1qz - sf - sc - ad':          lambda qz, sf_, sc, reimb, ad: qz - sf_ - sc - ad,
    'C: 1qz - sf - ad':               lambda qz, sf_, sc, reimb, ad: qz - sf_ - ad,
    'D: 1qz - sf':                    lambda qz, sf_, sc, reimb, ad: qz - sf_,
}

results = {k: {'ok': 0, 'diff': 0} for k in formulas}

saldo_final_issues = []

for row in carga_rows:
    cpf = row['cpf']
    p = painel.get(cpf)
    if not p:
        continue

    painel_sf = sf(p.get('saldo_final'))
    real_sf = sf(row['saldo_final'])
    real_sr = sf(row['saldo_reembolsar'])
    sc_calc = saldo_cartao_map.get(cpf, 0.0)
    real_sc = sf(row['saldo_cartao'])
    col_1qz = sf(row['col_1ª_qz'])
    adiantamento = sf(row['adiantamento'])
    reimb = sf(row['reembolso'])
    real_cp = sf(row['carga_parcial'])

    # Verificar saldo_final: usa painel diretamente ou apenas quando >= 0?
    # Verificar qual valor de saldo_final a planilha usa
    sf_used = real_sf  # o que a planilha mostra como saldo_final

    for label, fn in formulas.items():
        calc = fn(col_1qz, sf_used, real_sc, reimb, adiantamento)
        if abs(calc - real_cp) <= TOL:
            results[label]['ok'] += 1
        else:
            results[label]['diff'] += 1

    # Checar saldo_final issues
    if abs(painel_sf - real_sf) > TOL:
        saldo_final_issues.append({
            'cpf': cpf,
            'nome': row['colaborador'],
            'painel_sf': painel_sf,
            'real_sf': real_sf,
            'real_sr': real_sr,
            'diff': real_sf - painel_sf
        })

n = len(carga_rows)
print(f"FÓRMULAS TESTADAS ({n} linhas):\n")
for label, r in results.items():
    pct = r['ok'] / n * 100
    print(f"  {'✅' if r['diff'] == 0 else '  '} {label}: {r['ok']}/{n} ({pct:.1f}%)")

print(f"\nSALDO_FINAL divergências vs controle_painel: {len(saldo_final_issues)}")
for s in saldo_final_issues[:15]:
    print(f"  {s['nome'][:35]:35} painel={s['painel_sf']:10.2f} real={s['real_sf']:10.2f} diff={s['diff']:+.2f}")
